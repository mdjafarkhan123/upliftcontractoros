<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import ListPageShell from '$lib/components/shared/ListPageShell.svelte';
	import ListSearchBar from '$lib/components/shared/ListSearchBar.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import RequestKpiStrip from '$lib/components/requests/RequestKpiStrip.svelte';
	import RequestFilterTabs from '$lib/components/requests/RequestFilterTabs.svelte';
	import RequestFilterControl from '$lib/components/requests/RequestFilterControl.svelte';
	import RequestTable from '$lib/components/requests/RequestTable.svelte';
	import { requestsStore } from '$lib/stores/requests.svelte';
	import { requestStatsStore } from '$lib/stores/requestStats.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import type { RequestListItem, RequestsFilterStatus } from '$lib/types/requests';

	const member = getMemberContext();
	const canManage = $derived(member().can_view_full_pipeline);

	let statusTab = $state<RequestsFilterStatus>('all');
	let searchValue = $state('');
	let searchQuery = $state('');
	let dateFrom = $state('');
	let dateTo = $state('');

	const filters = $derived({
		status: statusTab,
		search: searchQuery,
		dateFrom: dateFrom || undefined,
		dateTo: dateTo || undefined
	});

	$effect(() => {
		void requestsStore.load(filters);
	});

	const items = $derived(requestsStore.items);
	const status = $derived(requestsStore.status);
	const errorMsg = $derived(requestsStore.error);

	// ── Row actions (archive / unarchive / delete) ─────────────────────────────
	let confirmAction = $state<{ kind: 'archive' | 'unarchive' | 'delete'; request: RequestListItem } | null>(
		null
	);
	let confirmOpen = $state(false);
	let confirmBusy = $state(false);

	const confirmCopy = $derived.by(() => {
		if (!confirmAction) return null;
		const { kind, request } = confirmAction;
		if (kind === 'delete') {
			return {
				title: `Delete "${request.title}"?`,
				description: `This request from ${request.contact.full_name} will be removed, along with its assessment visit.`,
				confirmLabel: 'Delete request',
				variant: 'destructive' as const
			};
		}
		if (kind === 'archive') {
			return {
				title: `Archive "${request.title}"?`,
				description: 'The request is closed without converting. You can unarchive it later.',
				confirmLabel: 'Archive',
				variant: 'default' as const
			};
		}
		return {
			title: `Unarchive "${request.title}"?`,
			description: 'The request returns to your active list.',
			confirmLabel: 'Unarchive',
			variant: 'default' as const
		};
	});

	function requestArchive(request: RequestListItem) {
		confirmAction = { kind: 'archive', request };
		confirmOpen = true;
	}
	function requestUnarchive(request: RequestListItem) {
		confirmAction = { kind: 'unarchive', request };
		confirmOpen = true;
	}
	function requestDelete(request: RequestListItem) {
		confirmAction = { kind: 'delete', request };
		confirmOpen = true;
	}

	async function handleConfirm() {
		if (!confirmAction || confirmBusy) return;
		confirmBusy = true;
		const { kind, request } = confirmAction;
		try {
			const res =
				kind === 'delete'
					? await fetch(`/api/requests/${request.id}`, { method: 'DELETE' })
					: await fetch(`/api/requests/${request.id}/${kind}`, { method: 'POST' });
			if (!res.ok && res.status !== 204) {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? `Failed to ${kind} request`);
				return;
			}
			if (kind === 'delete') {
				requestsStore.remove(request.id);
				toast.success('Request deleted');
			} else {
				// Status is derived server-side; the badge flips locally and the
				// tab counts refresh from the stats endpoint.
				requestsStore.update({
					id: request.id,
					status: kind === 'archive' ? 'archived' : 'new'
				});
				toast.success(kind === 'archive' ? 'Request archived' : 'Request unarchived');
			}
			void requestStatsStore.load(true);
			confirmOpen = false;
		} catch {
			toast.error('Network error');
		} finally {
			confirmBusy = false;
		}
	}

	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!confirmOpen || ConfirmDialog) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});
</script>

<svelte:head><title>Requests</title></svelte:head>

<PageWrapper title="Requests" subtitle="New work coming in — review, assess, convert">
	{#snippet actions()}
		{#if canManage}
			<Button type="button" onclick={() => goto('/requests/new')}>
				<i class="ri-add-line" aria-hidden="true"></i>
				New request
			</Button>
		{/if}
	{/snippet}

	<ListPageShell
		{status}
		itemCount={items.length}
		{errorMsg}
		skeletonLines={6}
		skeletonHeight="56px"
		skeletonLabel="Loading requests"
	>
		{#snippet kpi()}
			<RequestKpiStrip activeStatus={statusTab} onFilter={(s) => (statusTab = s)} />
		{/snippet}

		{#snippet tabs()}
			<RequestFilterTabs bind:status={statusTab} />
		{/snippet}

		{#snippet search()}
			<ListSearchBar
				bind:value={searchValue}
				placeholder="Search requests by title or client"
				onInput={(v) => (searchQuery = v)}
			/>
		{/snippet}

		{#snippet filter()}
			<RequestFilterControl bind:dateFrom bind:dateTo />
		{/snippet}

		{#snippet empty()}
			{#if searchQuery}
				<EmptyState
					iconClass="ri-inbox-2-line"
					title="No requests match your search"
					description={`No requests found for "${searchQuery}". Try a title or client name.`}
				/>
			{:else if dateFrom || dateTo || statusTab !== 'all'}
				<EmptyState
					iconClass="ri-inbox-2-line"
					title="No requests match your filters"
					description="Try a different status or date range."
				/>
			{:else}
				<EmptyState
					iconClass="ri-inbox-2-line"
					title="No requests yet"
					description="Requests capture new work coming in — from a call, a walk-in, or your website. Create one to start the funnel."
					actionLabel={canManage ? 'New request' : undefined}
					onAction={canManage ? () => goto('/requests/new') : undefined}
				/>
			{/if}
		{/snippet}

		{#snippet content()}
			<RequestTable
				{items}
				{canManage}
				onArchive={requestArchive}
				onUnarchive={requestUnarchive}
				onDelete={requestDelete}
			/>
		{/snippet}
	</ListPageShell>
</PageWrapper>

{#if confirmAction && confirmCopy && ConfirmDialog}
	<ConfirmDialog
		bind:open={confirmOpen}
		title={confirmCopy.title}
		description={confirmCopy.description}
		confirmLabel={confirmCopy.confirmLabel}
		variant={confirmCopy.variant}
		loading={confirmBusy}
		onConfirm={handleConfirm}
	/>
{/if}
