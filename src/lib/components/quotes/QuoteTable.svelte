<script lang="ts">
	import { goto } from '$app/navigation';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { quotesStore } from '$lib/stores/quotes.svelte';
	import type { QuoteListItem } from '$lib/types/quotes';
	import QuoteStatusBadge from './QuoteStatusBadge.svelte';
	import RowActionsMenu, { type RowAction } from '$lib/components/shared/RowActionsMenu.svelte';
	import ListTable from '$lib/components/shared/ListTable.svelte';
	import { formatCurrency } from '$lib/utils/format';

	let {
		items,
		canEdit = false,
		canSend = false,
		canConvert = false,
		canDuplicate = false,
		canDelete = false,
		selectable = false,
		selected,
		onToggleSelect,
		onToggleAll,
		allSelected = false,
		onSend,
		onResend,
		onConvert,
		onDuplicate,
		onMarkAccepted,
		onMarkDeclined,
		onDelete
	}: {
		items: QuoteListItem[];
		canEdit?: boolean;
		canSend?: boolean;
		canConvert?: boolean;
		canDuplicate?: boolean;
		canDelete?: boolean;
		selectable?: boolean;
		selected?: Set<string>;
		onToggleSelect?: (id: string) => void;
		onToggleAll?: () => void;
		allSelected?: boolean;
		onSend?: (quote: QuoteListItem) => void;
		onResend?: (quote: QuoteListItem) => void;
		onConvert?: (quote: QuoteListItem) => void;
		onDuplicate?: (quote: QuoteListItem) => void;
		onMarkAccepted?: (quote: QuoteListItem) => void;
		onMarkDeclined?: (quote: QuoteListItem) => void;
		onDelete?: (quote: QuoteListItem) => void;
	} = $props();

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function isExpired(iso: string | null): boolean {
		if (!iso) return false;
		return new Date(iso) < new Date();
	}

	function downloadPdf(quote: QuoteListItem) {
		const a = document.createElement('a');
		a.href = `/api/quotes/${quote.id}/pdf`;
		a.target = '_blank';
		a.rel = 'noopener';
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	function statusAllows(quote: QuoteListItem) {
		return {
			editable: quote.status === 'draft' || quote.status === 'changes_requested',
			sendable: quote.status === 'draft',
			resendable:
				quote.status === 'sent' ||
				quote.status === 'viewed' ||
				quote.status === 'changes_requested',
			convertible: quote.status === 'accepted',
			deletable: quote.status !== 'accepted',
			markable:
				quote.status === 'sent' || quote.status === 'viewed' || quote.status === 'changes_requested'
		};
	}

	function quoteActions(quote: QuoteListItem): RowAction[] {
		const a = statusAllows(quote);
		const actions: RowAction[] = [
			{
				key: 'open',
				label: 'Open quote',
				icon: 'ri-external-link-line',
				onSelect: () => goto(`/quotes/${quote.id}`)
			},
			{
				key: 'pdf',
				label: 'Download PDF',
				icon: 'ri-download-line',
				onSelect: () => downloadPdf(quote)
			}
		];
		if (canEdit && a.editable)
			actions.push({
				key: 'edit',
				label: 'Edit quote',
				icon: 'ri-pencil-line',
				onSelect: () => goto(`/quotes/${quote.id}`)
			});
		if (canSend && a.sendable && onSend)
			actions.push({
				key: 'send',
				label: 'Send to client',
				icon: 'ri-send-plane-line',
				onSelect: () => onSend(quote)
			});
		if (canSend && a.resendable && onResend)
			actions.push({
				key: 'resend',
				label: 'Resend to client',
				icon: 'ri-refresh-line',
				onSelect: () => onResend(quote)
			});
		if (canEdit && a.markable && onMarkAccepted)
			actions.push({
				key: 'accept',
				label: 'Mark accepted',
				icon: 'ri-checkbox-circle-line',
				onSelect: () => onMarkAccepted(quote)
			});
		if (canEdit && a.markable && onMarkDeclined)
			actions.push({
				key: 'decline',
				label: 'Mark declined',
				icon: 'ri-close-circle-line',
				onSelect: () => onMarkDeclined(quote)
			});
		if (canConvert && a.convertible && onConvert)
			actions.push({
				key: 'convert',
				label: 'Convert to invoice',
				icon: 'ri-file-list-3-line',
				onSelect: () => onConvert(quote)
			});
		if (canDuplicate && onDuplicate)
			actions.push({
				key: 'duplicate',
				label: 'Duplicate',
				icon: 'ri-file-copy-line',
				onSelect: () => onDuplicate(quote)
			});
		if (canDelete && a.deletable && onDelete)
			actions.push({
				key: 'delete',
				label: 'Delete quote',
				icon: 'ri-delete-bin-line',
				destructive: true,
				onSelect: () => onDelete(quote)
			});
		return actions;
	}
</script>

<ListTable ariaLabel="Quotes">
	{#snippet head()}
		{#if selectable}
			<th class="list-table__th list-table__th--check">
				<button
					type="button"
					onclick={onToggleAll}
					aria-label="Select all quotes"
					class="list-check"
					class:list-check--on={allSelected}
				>
					{#if allSelected}<i class="ri-check-line" aria-hidden="true"></i>{/if}
				</button>
			</th>
		{/if}
		<th class="list-table__th">Quote</th>
		<th class="list-table__th list-table__th--lg">Client</th>
		<th class="list-table__th">Status</th>
		<th class="list-table__th list-table__th--right">Total</th>
		<th class="list-table__th list-table__th--xl">Sent</th>
		<th class="list-table__th list-table__th--xl">Expires</th>
		<th class="list-table__th list-table__th--xxl">Created</th>
		<th class="list-table__th list-table__th--actions"></th>
	{/snippet}

	{#snippet body()}
		{#each items as quote (quote.id)}
			{@const isSelected = selected?.has(quote.id) ?? false}
			<tr
				class="list-table__row"
				class:list-table__row--selected={isSelected}
				use:prefetchOnIntent={() => {
					if (!selectable) quotesStore.prefetchDetail(quote.id);
				}}
				onclick={selectable ? () => onToggleSelect?.(quote.id) : () => goto(`/quotes/${quote.id}`)}
			>
				{#if selectable}
					<td class="list-table__td list-table__td--check">
						<span class="list-check" class:list-check--on={isSelected}>
							{#if isSelected}<i class="ri-check-line" aria-hidden="true"></i>{/if}
						</span>
					</td>
				{/if}

				<!-- Quote number + title -->
				<td class="list-table__td">
					<span class="quote-tbl__number">{quote.quote_number_display}</span>
					{#if selectable}
						<span class="quote-tbl__title">{quote.title}</span>
					{:else}
						<a
							href="/quotes/{quote.id}"
							onclick={(e) => e.stopPropagation()}
							class="quote-tbl__title"
						>
							{quote.title}
						</a>
					{/if}
					<span class="quote-tbl__client-inline">{quote.contact_name}</span>
				</td>

				<!-- Client — hidden on small screens -->
				<td class="list-table__td list-table__td--lg">
					<a
						href="/contacts/{quote.contact_id}"
						onclick={(e) => e.stopPropagation()}
						class="quote-tbl__client-link"
					>
						{quote.contact_name}
					</a>
				</td>

				<!-- Status -->
				<td class="list-table__td">
					<QuoteStatusBadge status={quote.status} />
				</td>

				<!-- Total -->
				<td class="list-table__td list-table__td--right">
					<span class="quote-tbl__amount">{formatCurrency(quote.total)}</span>
				</td>

				<!-- Sent -->
				<td class="list-table__td list-table__td--xl">
					{#if quote.sent_at}
						<span class="quote-tbl__date">{fmtDate(quote.sent_at)}</span>
					{:else}
						<span class="quote-tbl__date quote-tbl__date--empty">Not sent</span>
					{/if}
				</td>

				<!-- Expires -->
				<td class="list-table__td list-table__td--xl">
					{#if quote.expires_at}
						<span
							class="quote-tbl__date {isExpired(quote.expires_at) && quote.status !== 'accepted'
								? 'quote-tbl__date--expired'
								: ''}"
						>
							{fmtDate(quote.expires_at)}
						</span>
					{:else}
						<span class="quote-tbl__date quote-tbl__date--empty">No expiry</span>
					{/if}
				</td>

				<!-- Created -->
				<td class="list-table__td list-table__td--xxl">
					<span class="quote-tbl__date">{fmtDate(quote.created_at)}</span>
				</td>

				<!-- Actions -->
				<td class="list-table__td list-table__td--actions" onclick={(e) => e.stopPropagation()}>
					{#if !selectable}
						<RowActionsMenu
							actions={quoteActions(quote)}
							label="Actions for quote {quote.quote_number_display}"
						/>
					{/if}
				</td>
			</tr>
		{/each}
	{/snippet}
</ListTable>
