<script lang="ts">
	import { goto } from '$app/navigation';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { invoicesStore } from '$lib/stores/invoices.svelte';
	import type { InvoiceListItem } from '$lib/types/invoices';
	import { isEffectivelyOverdue } from '$lib/utils/invoices';
	import InvoiceStatusBadge from './InvoiceStatusBadge.svelte';
	import RowActionsMenu, { type RowAction } from '$lib/components/shared/RowActionsMenu.svelte';
	import ListTable from '$lib/components/shared/ListTable.svelte';
	import { formatCurrency } from '$lib/utils/format';

	let {
		items,
		canEdit = false,
		canSend = false,
		canDelete = false,
		selectable = false,
		selected,
		onToggleSelect,
		onToggleAll,
		allSelected = false,
		onSend,
		onDelete
	}: {
		items: InvoiceListItem[];
		canEdit?: boolean;
		canSend?: boolean;
		canDelete?: boolean;
		selectable?: boolean;
		selected?: Set<string>;
		onToggleSelect?: (id: string) => void;
		onToggleAll?: () => void;
		allSelected?: boolean;
		onSend?: (invoice: InvoiceListItem) => void;
		onDelete?: (invoice: InvoiceListItem) => void;
	} = $props();

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function downloadPdf(invoice: InvoiceListItem) {
		const a = document.createElement('a');
		a.href = `/api/invoices/${invoice.id}/pdf`;
		a.target = '_blank';
		a.rel = 'noopener';
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	function statusAllows(invoice: InvoiceListItem) {
		return {
			editable: invoice.status === 'draft',
			sendable: invoice.status === 'draft',
			// Delete (soft): the DELETE endpoint blocks only paid / partly-paid invoices, so drafts and
			// sent-but-unpaid invoices are deletable. (Strict Jobber has no cancel — cancel = delete.)
			deletable: invoice.status !== 'paid' && Number(invoice.amount_paid) === 0
		};
	}

	function invoiceActions(invoice: InvoiceListItem): RowAction[] {
		const a = statusAllows(invoice);
		const actions: RowAction[] = [
			{
				key: 'open',
				label: 'Open invoice',
				icon: 'ri-external-link-line',
				onSelect: () => goto(`/invoices/${invoice.id}`)
			},
			{
				key: 'pdf',
				label: 'Download PDF',
				icon: 'ri-download-line',
				onSelect: () => downloadPdf(invoice)
			}
		];
		if (canEdit && a.editable)
			actions.push({
				key: 'edit',
				label: 'Edit invoice',
				icon: 'ri-pencil-line',
				onSelect: () => goto(`/invoices/${invoice.id}`)
			});
		if (canSend && a.sendable && onSend)
			actions.push({
				key: 'send',
				label: 'Send to client',
				icon: 'ri-send-plane-line',
				onSelect: () => onSend(invoice)
			});
		if (canDelete && a.deletable && onDelete)
			actions.push({
				key: 'delete',
				label: 'Delete invoice',
				icon: 'ri-delete-bin-line',
				destructive: true,
				onSelect: () => onDelete(invoice)
			});
		return actions;
	}
</script>

<ListTable ariaLabel="Invoices">
	{#snippet head()}
		{#if selectable}
			<th class="list-table__th list-table__th--check">
				<button
					type="button"
					onclick={onToggleAll}
					aria-label="Select all invoices"
					class="list-check"
					class:list-check--on={allSelected}
				>
					{#if allSelected}<i class="ri-check-line" aria-hidden="true"></i>{/if}
				</button>
			</th>
		{/if}
		<th class="list-table__th">Invoice</th>
		<th class="list-table__th list-table__th--lg">Client</th>
		<th class="list-table__th">Status</th>
		<th class="list-table__th list-table__th--right">Total</th>
		<th class="list-table__th list-table__th--right list-table__th--xl">Balance</th>
		<th class="list-table__th list-table__th--xl">Due</th>
		<th class="list-table__th list-table__th--xxl">Created</th>
		<th class="list-table__th list-table__th--actions"></th>
	{/snippet}

	{#snippet body()}
		{#each items as invoice (invoice.id)}
			{@const overdue = isEffectivelyOverdue(invoice.status, invoice.due_date, invoice.amount_due)}
			{@const isSelected = selected?.has(invoice.id) ?? false}
			<tr
				class="list-table__row"
				class:list-table__row--selected={isSelected}
				use:prefetchOnIntent={() => {
					if (!selectable) invoicesStore.prefetchDetail(invoice.id);
				}}
				onclick={selectable
					? () => onToggleSelect?.(invoice.id)
					: () => goto(`/invoices/${invoice.id}`)}
			>
				{#if selectable}
					<td class="list-table__td list-table__td--check">
						<span class="list-check" class:list-check--on={isSelected}>
							{#if isSelected}<i class="ri-check-line" aria-hidden="true"></i>{/if}
						</span>
					</td>
				{/if}

				<!-- Invoice number + title -->
				<td class="list-table__td">
					<span class="invoice-tbl__number">{invoice.invoice_number_display}</span>
					{#if selectable}
						<span class="invoice-tbl__title">{invoice.title}</span>
					{:else}
						<a
							href="/invoices/{invoice.id}"
							onclick={(e) => e.stopPropagation()}
							class="invoice-tbl__title"
						>
							{invoice.title}
						</a>
					{/if}
					<span class="invoice-tbl__client-inline">{invoice.contact_name}</span>
				</td>

				<!-- Client — hidden on small screens -->
				<td class="list-table__td list-table__td--lg">
					{#if selectable}
						<span class="invoice-tbl__client-link">{invoice.contact_name}</span>
					{:else}
						<a
							href="/contacts/{invoice.contact_id}"
							onclick={(e) => e.stopPropagation()}
							class="invoice-tbl__client-link"
						>
							{invoice.contact_name}
						</a>
					{/if}
				</td>

				<!-- Status -->
				<td class="list-table__td">
					<InvoiceStatusBadge status={invoice.status} />
				</td>

				<!-- Total -->
				<td class="list-table__td list-table__td--right">
					<span class="invoice-tbl__amount">{formatCurrency(invoice.total)}</span>
				</td>

				<!-- Balance due -->
				<td class="list-table__td list-table__td--right list-table__td--xl">
					{#if Number(invoice.amount_due) > 0}
						<span class="invoice-tbl__amount {overdue ? 'invoice-tbl__amount--overdue' : ''}">
							{formatCurrency(invoice.amount_due)}
						</span>
					{:else}
						<span class="invoice-tbl__date invoice-tbl__date--empty">Paid</span>
					{/if}
				</td>

				<!-- Due date -->
				<td class="list-table__td list-table__td--xl">
					{#if invoice.due_date}
						<span class="invoice-tbl__date {overdue ? 'invoice-tbl__date--overdue' : ''}">
							{fmtDate(invoice.due_date)}
						</span>
					{:else}
						<span class="invoice-tbl__date invoice-tbl__date--empty">No due date</span>
					{/if}
				</td>

				<!-- Created -->
				<td class="list-table__td list-table__td--xxl">
					<span class="invoice-tbl__date">{fmtDate(invoice.created_at)}</span>
				</td>

				<!-- Actions -->
				<td class="list-table__td list-table__td--actions" onclick={(e) => e.stopPropagation()}>
					<RowActionsMenu
						actions={invoiceActions(invoice)}
						label="Actions for invoice {invoice.invoice_number_display}"
					/>
				</td>
			</tr>
		{/each}
	{/snippet}
</ListTable>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	// Invoice-specific cell content only — all table chrome (frame, header row,
	// row borders, hover, responsive column-hiding) comes from the shared global
	// `.list-table`. Mirrors `.quote-tbl` so both money tables read identically.
	.invoice-tbl {
		&__number {
			display: block;
			font-family: 'Geist Mono', monospace;
			font-size: 1.1rem;
			font-weight: $weight-semibold;
			color: var(--color-text-muted);
		}

		&__title {
			display: block;
			max-width: 240px;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			text-decoration: none;
			transition: color $duration-fast $ease-standard;

			&:hover,
			&:focus-visible {
				color: var(--color-brand);
				outline: none;
			}
		}

		&__client-inline {
			display: block;
			font-size: 1.1rem;
			color: var(--color-text-muted);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;

			@media (min-width: 1024px) {
				display: none;
			}
		}

		&__client-link {
			display: block;
			color: var(--color-text-secondary);
			text-decoration: none;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			transition: color $duration-fast $ease-standard;

			&:hover,
			&:focus-visible {
				color: var(--color-brand);
				outline: none;
			}
		}

		&__amount {
			font-weight: $weight-semibold;
			font-variant-numeric: tabular-nums;
			color: var(--color-text-primary);

			&--overdue {
				color: var(--danger-solid);
			}
		}

		&__date {
			color: var(--color-text-secondary);
			white-space: nowrap;

			&--overdue {
				color: var(--danger-solid);
			}
			&--empty {
				font-style: italic;
				color: var(--color-text-muted);
				opacity: 0.5;
			}
		}
	}
</style>
