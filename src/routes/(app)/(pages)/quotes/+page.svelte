<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { SvelteSet } from 'svelte/reactivity';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import ListPageShell from '$lib/components/shared/ListPageShell.svelte';
	import ListBulkBar, { type BulkAction } from '$lib/components/shared/ListBulkBar.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import QuotesFilterTabs from '$lib/components/quotes/QuotesFilterTabs.svelte';
	import QuoteStatsBar from '$lib/components/quotes/QuoteStatsBar.svelte';
	import QuoteTable from '$lib/components/quotes/QuoteTable.svelte';
	import QuoteFilterControl from '$lib/components/quotes/QuoteFilterControl.svelte';
	import ListSearchBar from '$lib/components/shared/ListSearchBar.svelte';
	import RecycleBinList from '$lib/components/shared/RecycleBinList.svelte';
	import { quotesStore } from '$lib/stores/quotes.svelte';
	import type { QuotesGroup, QuotesStatusChip, QuoteListItem as QuoteRow } from '$lib/types/quotes';
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
	// Recycle-bin view (Deleted tab) — swaps the table for the shared bin list.
	const isDeletedView = $derived(statusChip === 'deleted');
	let searchValue = $state('');
	let searchQuery = $state('');
	// Advanced filter (QuoteFilterControl): salesperson + created-date range.
	let issuedBy = $state('');
	let dateFrom = $state('');
	let dateTo = $state('');
	const filters = $derived({
		group,
		status: statusChip,
		search: searchQuery,
		issuedBy: issuedBy || null,
		dateFrom: dateFrom || null,
		dateTo: dateTo || null
	});

	$effect(() => {
		void quotesStore.load(filters);
	});

	// Salesperson picker options — active team members (reuses the shared assignees
	// endpoint). Only fetched for quote viewers; the filter hides when the list is empty.
	let salespeople = $state<{ id: string; full_name: string }[]>([]);
	let salespeopleLoaded = $state(false);
	$effect(() => {
		if (salespeopleLoaded) return;
		salespeopleLoaded = true;
		void fetch('/api/contacts/assignees').then(async (r) => {
			if (!r.ok) return;
			const a = (await r.json()) as { assignees: { id: string; full_name: string }[] };
			salespeople = a.assignees;
		});
	});
	const showSalesperson = $derived(salespeople.length > 0);

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

	let loadingMore = $state(false);
	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		await quotesStore.loadMore(filters);
		loadingMore = false;
	}

	// ── Restore (recycle bin) ────────────────────────────────────────────────────
	function handleRestored(id: string) {
		quotesStore.remove(id);
	}

	// ── Bulk selection ───────────────────────────────────────────────────────────
	let selectionMode = $state(false);
	const selected = new SvelteSet<string>();
	const selectedIds = $derived([...selected]);

	function enterSelect() {
		selectionMode = true;
	}
	function exitSelect() {
		selectionMode = false;
		selected.clear();
	}
	function toggleSelect(id: string) {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
	}
	const allLoadedSelected = $derived(items.length > 0 && selected.size === items.length);
	function toggleSelectAll() {
		if (allLoadedSelected) selected.clear();
		else for (const q of items) selected.add(q.id);
	}

	// Selection doesn't apply to the recycle bin — leave select mode on switch.
	$effect(() => {
		if (isDeletedView && selectionMode) exitSelect();
	});

	let bulkDeleteOpen = $state(false);
	let bulkBusy = $state(false);
	let BulkConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!bulkDeleteOpen || BulkConfirmDialog) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			BulkConfirmDialog = m.default;
		});
	});

	const bulkActions = $derived<BulkAction[]>([
		{
			key: 'delete',
			label: 'Delete',
			icon: 'ri-delete-bin-line',
			tone: 'danger',
			onSelect: () => (bulkDeleteOpen = true)
		}
	]);

	async function handleBulkDelete() {
		if (bulkBusy || selectedIds.length === 0) return;
		bulkBusy = true;
		try {
			const ids = selectedIds;
			const res = await fetch('/api/quotes/bulk', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'delete', ids })
			});
			const b = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(b.error ?? 'Failed to delete quotes');
				return;
			}
			// The endpoint skips accepted quotes (signed records) and returns only the
			// ids it actually removed — drop just those from the list, warn on the rest.
			const removed = (b.data?.ids as string[] | undefined) ?? ids;
			for (const id of removed) quotesStore.remove(id);
			const n = removed.length;
			const skipped = ids.length - n;
			if (n > 0) toast.success(`${n} quote${n === 1 ? '' : 's'} deleted`);
			if (skipped > 0)
				toast.info(`${skipped} accepted quote${skipped === 1 ? '' : 's'} couldn't be deleted`);
			bulkDeleteOpen = false;
			exitSelect();
		} finally {
			bulkBusy = false;
		}
	}
</script>

<svelte:head><title>Quotes</title></svelte:head>

<PageWrapper title="Quotes" subtitle="Drafts, sent, viewed, accepted">
	{#snippet actions()}
		{#if selectionMode}
			<Button type="button" variant="secondary" onclick={exitSelect}>Done</Button>
		{:else}
			{#if canDelete && !isDeletedView}
				<Button type="button" variant="secondary" onclick={enterSelect}>
					<i class="ri-checkbox-line" aria-hidden="true"></i> Select
				</Button>
			{/if}
			<Button type="button" variant="secondary" onclick={() => goto('/quotes/templates')}>
				<i class="ri-layout-grid-line" aria-hidden="true"></i>
				Templates
			</Button>
			<Button type="button" onclick={() => goto('/quotes/new')}>
				<i class="ri-add-line" aria-hidden="true"></i>
				New quote
			</Button>
		{/if}
	{/snippet}

	<ListPageShell
		{status}
		itemCount={items.length}
		{errorMsg}
		{nextCursor}
		{loadingMore}
		onLoadMore={loadMore}
		skeletonLines={6}
		skeletonHeight="56px"
		skeletonLabel="Loading quotes"
	>
		{#snippet kpi()}
			{#if !isDeletedView}
				<QuoteStatsBar />
			{/if}
		{/snippet}

		{#snippet tabs()}
			<QuotesFilterTabs bind:group bind:status={statusChip} />
		{/snippet}

		{#snippet search()}
			<ListSearchBar
				bind:value={searchValue}
				placeholder="Search quotes by number, title, or client"
				onInput={(v) => (searchQuery = v)}
			/>
		{/snippet}

		{#snippet filter()}
			<QuoteFilterControl bind:issuedBy bind:dateFrom bind:dateTo {salespeople} {showSalesperson} />
		{/snippet}

		{#snippet empty()}
			{#if isDeletedView}
				<EmptyState
					iconClass="ri-delete-bin-line"
					title="Recycle bin is empty"
					description="Deleted quotes appear here for 30 days, then are permanently removed. Restore one any time before then."
				/>
			{:else if searchQuery}
				<EmptyState
					iconClass="ri-file-text-line"
					title="No quotes match your search"
					description={`No quotes found for "${searchQuery}". Try a quote number, title, or client name.`}
				/>
			{:else if issuedBy || dateFrom || dateTo}
				<EmptyState
					iconClass="ri-file-text-line"
					title="No quotes match your filters"
					description="Try a different salesperson or date range."
				/>
			{:else}
				<EmptyState
					iconClass="ri-file-text-line"
					title="No quotes yet"
					description="Quotes you create will appear here. Send one to a customer to get started."
					actionLabel="New quote"
					onAction={() => goto('/quotes/new')}
				/>
			{/if}
		{/snippet}

		{#snippet content()}
			{#if isDeletedView}
				<RecycleBinList
					items={items.map((q) => ({
						id: q.id,
						title: q.quote_number_display,
						subtitle: q.contact_name,
						deleted_at: q.deleted_at
					}))}
					noun="quote"
					restoreEndpoint={(id) => `/api/quotes/${id}/restore`}
					canRestore={canDelete}
					onRestored={handleRestored}
				/>
			{:else}
				<QuoteTable
					{items}
					{canEdit}
					{canSend}
					{canConvert}
					canDuplicate={canCreate}
					{canDelete}
					selectable={selectionMode}
					{selected}
					onToggleSelect={toggleSelect}
					onToggleAll={toggleSelectAll}
					allSelected={allLoadedSelected}
					onSend={requestSend}
					onResend={requestResend}
					onConvert={convertToInvoice}
					onDuplicate={duplicate}
					onMarkAccepted={requestMarkAccepted}
					onMarkDeclined={requestMarkDeclined}
					onDelete={requestDelete}
				/>
			{/if}
		{/snippet}
	</ListPageShell>
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

{#if selectionMode && selectedIds.length > 0}
	<ListBulkBar
		count={selectedIds.length}
		actions={bulkActions}
		busy={bulkBusy}
		onCancel={exitSelect}
	/>
{/if}

{#if bulkDeleteOpen && BulkConfirmDialog}
	<BulkConfirmDialog
		bind:open={bulkDeleteOpen}
		title="Delete {selectedIds.length} quote{selectedIds.length === 1 ? '' : 's'}?"
		description="They move to the Recycle Bin — you can restore them within 30 days. Accepted quotes are signed records and will be skipped."
		confirmLabel="Move to Recycle Bin"
		variant="destructive"
		loading={bulkBusy}
		onConfirm={handleBulkDelete}
	/>
{/if}
