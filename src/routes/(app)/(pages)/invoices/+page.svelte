<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import ListPageShell from '$lib/components/shared/ListPageShell.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import InvoicesFilterTabs from '$lib/components/invoices/InvoicesFilterTabs.svelte';
	import InvoiceStatsBar from '$lib/components/invoices/InvoiceStatsBar.svelte';
	import InvoiceTable from '$lib/components/invoices/InvoiceTable.svelte';
	import InvoiceListItem from '$lib/components/invoices/InvoiceListItem.svelte';
	import ListSearchBar from '$lib/components/shared/ListSearchBar.svelte';
	import { invoicesStore } from '$lib/stores/invoices.svelte';
	import { invoiceStatsStore } from '$lib/stores/invoiceStats.svelte';
	import type {
		InvoicesGroup,
		InvoicesStatusChip,
		InvoiceListItem as InvoiceRow
	} from '$lib/types/invoices';
	import { goto } from '$app/navigation';
	import { getMemberContext } from '$lib/context/member';
	import { toast } from '$lib/stores/toast.svelte';

	const member = getMemberContext();
	const canEdit = $derived(member().can_create_invoices);
	const canSend = $derived(member().can_send_invoices);
	const canCancel = $derived(member().can_delete_invoices);

	let group = $state<InvoicesGroup>('all');
	let statusChip = $state<InvoicesStatusChip>('all');
	let searchValue = $state('');
	let searchQuery = $state('');
	const filters = $derived({ group, status: statusChip, search: searchQuery });

	$effect(() => {
		void invoicesStore.load(filters);
	});

	// ── Send + Cancel — one lazy ConfirmDialog, mirroring the Quotes page ─────────
	let confirmAction = $state<{ kind: 'send' | 'cancel' | 'delete'; invoice: InvoiceRow } | null>(
		null
	);
	let confirmOpen = $state(false);
	let confirmBusy = $state(false);

	const confirmCopy = $derived.by(() => {
		if (!confirmAction) return null;
		const { kind, invoice } = confirmAction;
		if (kind === 'send') {
			return {
				title: `Send ${invoice.invoice_number_display}?`,
				description: `${invoice.contact_name} will receive this invoice and can pay it online.`,
				confirmLabel: 'Send to client',
				variant: 'default' as const
			};
		}
		if (kind === 'delete') {
			return {
				title: `Delete ${invoice.invoice_number_display}?`,
				description: `This removes the invoice for ${invoice.contact_name} from your list. You can only delete invoices with no recorded payments.`,
				confirmLabel: 'Delete invoice',
				variant: 'destructive' as const
			};
		}
		return {
			title: `Cancel ${invoice.invoice_number_display}?`,
			description: `This invoice for ${invoice.contact_name} will be voided. You can't collect payment on a cancelled invoice.`,
			confirmLabel: 'Cancel invoice',
			variant: 'destructive' as const
		};
	});

	function requestSend(invoice: InvoiceRow) {
		confirmAction = { kind: 'send', invoice };
		confirmOpen = true;
	}
	function requestCancel(invoice: InvoiceRow) {
		confirmAction = { kind: 'cancel', invoice };
		confirmOpen = true;
	}
	function requestDelete(invoice: InvoiceRow) {
		confirmAction = { kind: 'delete', invoice };
		confirmOpen = true;
	}

	async function handleConfirm() {
		if (!confirmAction || confirmBusy) return;
		confirmBusy = true;
		const { kind, invoice } = confirmAction;
		try {
			if (kind === 'send') {
				const res = await fetch(`/api/invoices/${invoice.id}/send`, { method: 'POST' });
				const body = await res.json().catch(() => ({}));
				if (!res.ok) {
					toast.error(body.error ?? 'Failed to send invoice');
					return;
				}
				invoicesStore.update({
					id: invoice.id,
					status: 'sent',
					sent_at: body.data?.sent_at ?? new Date().toISOString()
				});
				void invoiceStatsStore.load(true);
				toast.success(`${invoice.invoice_number_display} sent to ${invoice.contact_name}`);
				confirmOpen = false;
				return;
			}
			if (kind === 'delete') {
				const res = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' });
				if (!res.ok) {
					const body = await res.json().catch(() => ({}));
					toast.error(body.error ?? 'Failed to delete invoice');
					return;
				}
				invoicesStore.remove(invoice.id);
				void invoiceStatsStore.load(true);
				toast.success(`${invoice.invoice_number_display} deleted`);
				confirmOpen = false;
				return;
			}
			const res = await fetch(`/api/invoices/${invoice.id}/cancel`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to cancel invoice');
				return;
			}
			invoicesStore.update({ id: invoice.id, status: 'cancelled' });
			void invoiceStatsStore.load(true);
			toast.success(`${invoice.invoice_number_display} cancelled`);
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

	const items = $derived(invoicesStore.items);
	const nextCursor = $derived(invoicesStore.nextCursor);
	const status = $derived(invoicesStore.status);
	const errorMsg = $derived(invoicesStore.error);

	let loadingMore = $state(false);
	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		await invoicesStore.loadMore(filters);
		loadingMore = false;
	}
</script>

<svelte:head><title>Invoices</title></svelte:head>

<PageWrapper title="Invoices" subtitle="Sent, paid, and outstanding">
	{#snippet actions()}
		<Button type="button" onclick={() => goto('/invoices/new')}>
			<i class="ri-add-line" aria-hidden="true"></i>
			New invoice
		</Button>
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
		skeletonLabel="Loading invoices"
	>
		{#snippet kpi()}
			<InvoiceStatsBar />
		{/snippet}

		{#snippet tabs()}
			<InvoicesFilterTabs bind:group bind:status={statusChip} />
		{/snippet}

		{#snippet search()}
			<ListSearchBar
				bind:value={searchValue}
				placeholder="Search invoices by number, title, or client"
				onInput={(v) => (searchQuery = v)}
			/>
		{/snippet}

		{#snippet empty()}
			{#if searchQuery}
				<EmptyState
					iconClass="ri-receipt-line"
					title="No invoices match your search"
					description={`No invoices found for "${searchQuery}". Try an invoice number, title, or client name.`}
				/>
			{:else}
				<EmptyState
					iconClass="ri-receipt-line"
					title="No invoices yet"
					description="Invoices you create will appear here. Send one to a customer to start collecting payment."
					actionLabel="New invoice"
					onAction={() => goto('/invoices/new')}
				/>
			{/if}
		{/snippet}

		{#snippet content()}
			<!-- Desktop: table -->
			<div class="invoices-page__table">
				<InvoiceTable
					{items}
					{canEdit}
					{canSend}
					{canCancel}
					onSend={requestSend}
					onCancel={requestCancel}
					onDelete={requestDelete}
				/>
			</div>

			<!-- Mobile: cards -->
			<ul class="invoices-page__cards">
				{#each items as invoice (invoice.id)}
					<li><InvoiceListItem {invoice} /></li>
				{/each}
			</ul>
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

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	// Toolbar / search / load-more / skeleton now live in <ListPageShell>. Only the
	// invoices-specific desktop-table vs mobile-card switch remains here.
	.invoices-page {
		&__table {
			display: none;
			@media (min-width: $bp-tablet) {
				display: block;
			}
		}
		&__cards {
			display: grid;
			gap: $space-3;
			list-style: none;
			margin: 0;
			padding: 0;
			@media (min-width: $bp-tablet) {
				display: none;
			}
		}
	}
</style>
