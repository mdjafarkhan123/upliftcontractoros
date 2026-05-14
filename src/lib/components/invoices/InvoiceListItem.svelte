<script lang="ts">
	import InvoiceStatusBadge from './InvoiceStatusBadge.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import { isEffectivelyOverdue } from '$lib/utils/invoices';
	import type { InvoiceListItem } from '$lib/types/invoices';
	import { AlertCircle, ChevronRight } from '@lucide/svelte';

	let { invoice }: { invoice: InvoiceListItem } = $props();

	const dueLabel = $derived(
		invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-US') : null
	);
	const showDue = $derived(
		invoice.status !== 'paid' && invoice.status !== 'cancelled' && Number(invoice.amount_due) > 0
	);
	const overdue = $derived(isEffectivelyOverdue(invoice.status, invoice.due_date, invoice.amount_due));
</script>

<a
	href={`/invoices/${invoice.id}`}
	class="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent active:bg-accent"
>
	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			<span class="text-sm font-semibold text-foreground">{invoice.invoice_number_display}</span>
			<InvoiceStatusBadge status={invoice.status} />
			{#if overdue}
				<span class="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">
					<AlertCircle class="h-3 w-3" />Overdue
				</span>
			{/if}
		</div>
		<p class="mt-1 truncate text-sm text-muted-foreground">
			{invoice.contact_name} &middot; {invoice.title}
		</p>
		{#if dueLabel}
			<p class={'mt-0.5 text-xs ' + (overdue ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
				Due {dueLabel}
			</p>
		{/if}
	</div>
	<div class="text-right">
		<div class="text-sm font-semibold tabular-nums text-foreground">
			{formatCurrency(invoice.total)}
		</div>
		{#if showDue}
			<div class="text-xs tabular-nums text-muted-foreground">
				{formatCurrency(invoice.amount_due)} due
			</div>
		{/if}
	</div>
	<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
</a>
