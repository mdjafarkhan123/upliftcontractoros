<script lang="ts">
	import { formatCurrency } from '$lib/utils/format';

	let {
		subtotal,
		tax_rate,
		tax_amount,
		total,
		amount_paid,
		amount_due
	}: {
		subtotal: string;
		tax_rate: string;
		tax_amount: string;
		total: string;
		amount_paid?: string | null;
		amount_due?: string | null;
	} = $props();

	const taxPct = $derived((Number(tax_rate) * 100).toFixed(2) + '%');
	const showBalance = $derived(amount_paid !== undefined && Number(amount_paid) > 0);
</script>

<div class="rounded-xl border border-border bg-card p-4">
	<dl class="space-y-2 text-sm">
		<div class="flex justify-between">
			<dt class="text-muted-foreground">Subtotal</dt>
			<dd class="tabular-nums">{formatCurrency(subtotal)}</dd>
		</div>
		<div class="flex justify-between">
			<dt class="text-muted-foreground">Tax ({taxPct})</dt>
			<dd class="tabular-nums">{formatCurrency(tax_amount)}</dd>
		</div>
		<div class="flex justify-between border-t border-border pt-2 text-base font-semibold">
			<dt>Total</dt>
			<dd class="tabular-nums">{formatCurrency(total)}</dd>
		</div>
		{#if showBalance && amount_paid && amount_due}
			<div class="flex justify-between text-xs text-muted-foreground">
				<dt>Paid</dt>
				<dd class="tabular-nums">{formatCurrency(amount_paid)}</dd>
			</div>
			<div class="flex justify-between text-sm font-semibold text-foreground">
				<dt>Balance due</dt>
				<dd class="tabular-nums">{formatCurrency(amount_due)}</dd>
			</div>
		{/if}
	</dl>
</div>
