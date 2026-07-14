<script lang="ts">
	import InvoiceStatusBadge from './InvoiceStatusBadge.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import { isEffectivelyOverdue } from '$lib/utils/invoices';
	import type { InvoiceListItem } from '$lib/types/invoices';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { invoicesStore } from '$lib/stores/invoices.svelte';

	let { invoice }: { invoice: InvoiceListItem } = $props();

	const dueLabel = $derived(
		invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-US') : null
	);
	const showDue = $derived(
		invoice.status !== 'paid' && invoice.status !== 'cancelled' && Number(invoice.amount_due) > 0
	);
	const overdue = $derived(
		isEffectivelyOverdue(invoice.status, invoice.due_date, invoice.amount_due)
	);
</script>

<a
	href={`/invoices/${invoice.id}`}
	use:prefetchOnIntent={() => invoicesStore.prefetchDetail(invoice.id)}
	class="invoice-card"
>
	<div class="invoice-card__body">
		<div class="invoice-card__top">
			<span class="invoice-card__number">{invoice.invoice_number_display}</span>
			<InvoiceStatusBadge status={invoice.status} />
			{#if overdue}
				<span class="invoice-card__overdue">
					<i class="ri-error-warning-line" aria-hidden="true"></i>Overdue
				</span>
			{/if}
		</div>
		<p class="invoice-card__sub">
			{invoice.contact_name} &middot; {invoice.title}
		</p>
		{#if dueLabel}
			<p class="invoice-card__due {overdue ? 'invoice-card__due--overdue' : ''}">
				Due {dueLabel}
			</p>
		{/if}
	</div>

	<div class="invoice-card__right">
		<span class="invoice-card__amount">{formatCurrency(invoice.total)}</span>
		{#if showDue}
			<span class="invoice-card__remaining">{formatCurrency(invoice.amount_due)} due</span>
		{/if}
	</div>

	<span class="invoice-card__chevron" aria-hidden="true">
		<i class="ri-arrow-right-s-line"></i>
	</span>
</a>
