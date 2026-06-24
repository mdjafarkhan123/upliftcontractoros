<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import QuotesFilterTabs from '$lib/components/quotes/QuotesFilterTabs.svelte';
	import QuoteStatsBar from '$lib/components/quotes/QuoteStatsBar.svelte';
	import QuoteTable from '$lib/components/quotes/QuoteTable.svelte';
	import ListSearchBar from '$lib/components/shared/ListSearchBar.svelte';
	import { quotesStore } from '$lib/stores/quotes.svelte';
	import type { QuotesGroup, QuotesStatusChip, QuoteListItem as QuoteRow } from '$lib/types/quotes';
	import { FileText, LayoutTemplate, Plus } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { getMemberContext } from '$lib/context/member';
	import { toast } from '$lib/stores/toast.svelte';

	const member = getMemberContext();
	const canEdit = $derived(member().can_edit_quotes);
	const canSend = $derived(member().can_send_quotes);
	const canDelete = $derived(member().can_delete_quotes);
	const canConvert = $derived(member().can_create_invoices);
	const canCreate = $derived(member().can_create_quotes);

	let group = $state<QuotesGroup>('all');
	let statusChip = $state<QuotesStatusChip>('all');
	let searchValue = $state('');
	let search = $state('');
	const filters = $derived({ group, status: statusChip, search });

	$effect(() => {
		void quotesStore.load(filters);
	});

	// --- Row quick actions -------------------------------------------------
	// Convert fires directly (it navigates to the new invoice). Send / resend /
	// delete all go through one shared confirm dialog — send/resend reach a real
	// client, delete cannot be undone, so each gets an explicit confirmation.
	let actionBusyId = $state<string | null>(null);

	async function convertToInvoice(quote: QuoteRow) {
		if (actionBusyId) return;
		actionBusyId = quote.id;
		try {
			const res = await fetch(`/api/quotes/${quote.id}/convert-to-invoice`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to convert');
				return;
			}
			const d = body.data as {
				id: string;
				invoice_number_display: string;
				already_existed: boolean;
			};
			if (d.already_existed) toast.info(`Invoice ${d.invoice_number_display} already exists`);
			else toast.success(`Invoice ${d.invoice_number_display} created`);
			goto(`/invoices/${d.id}`);
		} catch {
			toast.error('Network error');
		} finally {
			actionBusyId = null;
		}
	}

	async function duplicate(quote: QuoteRow) {
		if (actionBusyId) return;
		actionBusyId = quote.id;
		try {
			const res = await fetch(`/api/quotes/${quote.id}/duplicate`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to duplicate');
				return;
			}
			const d = body.data as { id: string; quote_number_display: string };
			toast.success(`${d.quote_number_display} created as a draft`);
			goto(`/quotes/${d.id}`);
		} catch {
			toast.error('Network error');
		} finally {
			actionBusyId = null;
		}
	}

	// --- Offline mark accepted / declined ---------------------------------
	let offlineAction = $state<{ mode: 'accepted' | 'declined'; quote: QuoteRow } | null>(null);
	let offlineOpen = $state(false);

	function requestMarkAccepted(quote: QuoteRow) {
		offlineAction = { mode: 'accepted', quote };
		offlineOpen = true;
	}
	function requestMarkDeclined(quote: QuoteRow) {
		offlineAction = { mode: 'declined', quote };
		offlineOpen = true;
	}
	function onOfflineDone(status: 'accepted' | 'declined') {
		if (offlineAction) quotesStore.update({ id: offlineAction.quote.id, status });
	}

	let OfflineDialog = $state<
		typeof import('$lib/components/quotes/QuoteOfflineResultDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!offlineOpen || OfflineDialog) return;
		void import('$lib/components/quotes/QuoteOfflineResultDialog.svelte').then((m) => {
			OfflineDialog = m.default;
		});
	});

	let confirmAction = $state<{ kind: 'delete' | 'send' | 'resend'; quote: QuoteRow } | null>(null);
	let confirmOpen = $state(false);
	let confirmBusy = $state(false);

	const confirmCopy = $derived.by(() => {
		if (!confirmAction) return null;
		const { kind, quote } = confirmAction;
		if (kind === 'delete') {
			return {
				title: `Delete ${quote.quote_number_display}?`,
				description: `This quote for ${quote.contact_name} will be permanently removed. This cannot be undone.`,
				confirmLabel: 'Delete quote',
				variant: 'destructive' as const
			};
		}
		if (kind === 'send') {
			return {
				title: `Send ${quote.quote_number_display}?`,
				description: `${quote.contact_name} will receive this quote and can review and accept it online.`,
				confirmLabel: 'Send to client',
				variant: 'default' as const
			};
		}
		return {
			title: `Resend ${quote.quote_number_display}?`,
			description: `${quote.contact_name} will get a fresh copy of this quote with a new link.`,
			confirmLabel: 'Resend to client',
			variant: 'default' as const
		};
	});

	function requestDelete(quote: QuoteRow) {
		confirmAction = { kind: 'delete', quote };
		confirmOpen = true;
	}
	function requestSend(quote: QuoteRow) {
		confirmAction = { kind: 'send', quote };
		confirmOpen = true;
	}
	function requestResend(quote: QuoteRow) {
		confirmAction = { kind: 'resend', quote };
		confirmOpen = true;
	}

	async function handleConfirm() {
		if (!confirmAction || confirmBusy) return;
		confirmBusy = true;
		const { kind, quote } = confirmAction;
		try {
			if (kind === 'delete') {
				const res = await fetch(`/api/quotes/${quote.id}`, { method: 'DELETE' });
				if (!res.ok) {
					const body = await res.json().catch(() => ({}));
					toast.error(body.error ?? 'Failed to delete');
					return;
				}
				quotesStore.remove(quote.id);
				toast.success(`${quote.quote_number_display} deleted`);
				confirmOpen = false;
				return;
			}
			const path = kind === 'send' ? 'send' : 'resend';
			const res = await fetch(`/api/quotes/${quote.id}/${path}`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to send quote');
				return;
			}
			if (kind === 'send') {
				quotesStore.update({
					id: quote.id,
					status: 'sent',
					sent_at: body.data?.sent_at ?? new Date().toISOString()
				});
				toast.success(`${quote.quote_number_display} sent to ${quote.contact_name}`);
			} else {
				toast.success(`${quote.quote_number_display} resent to ${quote.contact_name}`);
			}
			confirmOpen = false;
		} catch {
			toast.error('Network error');
		} finally {
			confirmBusy = false;
		}
	}

	// The confirm dialog only renders once an action that needs it is requested.
	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!confirmOpen || ConfirmDialog) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});

	const items = $derived(quotesStore.items);
	const nextCursor = $derived(quotesStore.nextCursor);
	const status = $derived(quotesStore.status);
	const errorMsg = $derived(quotesStore.error);
	const showSkeleton = $derived(status === 'loading' && items.length === 0);
	const showError = $derived(status === 'error' && items.length === 0);

	let loadingMore = $state(false);
	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		await quotesStore.loadMore(filters);
		loadingMore = false;
	}
</script>

<svelte:head><title>Quotes</title></svelte:head>

<PageWrapper title="Quotes" subtitle="Drafts, sent, viewed, accepted">
	{#snippet actions()}
		<Button variant="outline" onclick={() => goto('/quotes/templates')}>
			<LayoutTemplate class="mr-1 h-4 w-4" />Templates
		</Button>
		<Button onclick={() => goto('/quotes/new')}>
			<Plus class="mr-1 h-4 w-4" />New quote
		</Button>
	{/snippet}

	<div class="space-y-4">
		<QuoteStatsBar />

		<ListSearchBar
			bind:value={searchValue}
			placeholder="Search quotes by number, title, or client"
			onInput={(v) => (search = v)}
		/>

		<QuotesFilterTabs bind:group bind:status={statusChip} />

		{#if showSkeleton}
			<SkeletonLoader lines={6} height="84px" label="Loading quotes" />
		{:else if showError}
			<p class="text-sm text-destructive">{errorMsg}</p>
		{:else if items.length === 0}
			{#if search}
				<EmptyState
					icon={FileText}
					title="No quotes match your search"
					description={`No quotes found for “${search}”. Try a quote number, title, or client name.`}
				/>
			{:else}
				<EmptyState
					icon={FileText}
					title="No quotes yet"
					description="Quotes you create will appear here. Send one to a customer to get started."
					actionLabel="New quote"
					onAction={() => goto('/quotes/new')}
				/>
			{/if}
		{:else}
			<QuoteTable
				{items}
				{canEdit}
				{canSend}
				{canConvert}
				canDuplicate={canCreate}
				{canDelete}
				onSend={requestSend}
				onResend={requestResend}
				onConvert={convertToInvoice}
				onDuplicate={duplicate}
				onMarkAccepted={requestMarkAccepted}
				onMarkDeclined={requestMarkDeclined}
				onDelete={requestDelete}
			/>

			{#if nextCursor}
				<div class="flex justify-center pt-2">
					<Button variant="outline" disabled={loadingMore} onclick={loadMore}>
						{loadingMore ? 'Loading…' : 'Load more'}
					</Button>
				</div>
			{/if}
		{/if}
	</div>
</PageWrapper>

{#if offlineAction && OfflineDialog}
	<OfflineDialog
		bind:open={offlineOpen}
		mode={offlineAction.mode}
		quote={offlineAction.quote}
		onDone={onOfflineDone}
	/>
{/if}

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
