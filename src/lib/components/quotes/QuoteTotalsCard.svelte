<script lang="ts">
	import { formatCurrency } from '$lib/utils/format';

	let {
		subtotal,
		// Quote-level discount applied before tax. discount_amount is the dollars-off;
		// discount_type/value drive the "(10%)" label suffix. Row hidden when amount <= 0.
		discount_type = 'none',
		discount_value = null,
		discount_amount = null,
		discount_label = null,
		tax_rate,
		tax_amount,
		total,
		deposit_required,
		deposit_type,
		deposit_percent,
		deposit_amount,
		// Optional add-on lines shown below the total as "not included" — the customer can
		// add these when accepting. Display only; never part of the total above.
		optionalItems = []
	}: {
		subtotal: string;
		discount_type?: string;
		discount_value?: string | null;
		discount_amount?: string | null;
		discount_label?: string | null;
		tax_rate: string;
		tax_amount: string;
		total: string;
		deposit_required?: boolean;
		deposit_type?: string;
		deposit_percent?: string | null;
		deposit_amount?: string | null;
		optionalItems?: { description: string; total: number }[];
	} = $props();

	const taxPct = $derived((Number(tax_rate) * 100).toFixed(2) + '%');
	const discountNum = $derived(Number(discount_amount ?? 0));
	const discountText = $derived.by(() => {
		const base = discount_label?.trim() || 'Discount';
		if (discount_type === 'percent' && discount_value) {
			const v = Number(discount_value);
			return `${base} (${v.toFixed(v % 1 === 0 ? 0 : 2)}%)`;
		}
		return base;
	});
	const depositLabel = $derived.by(() => {
		if (deposit_type === 'percent' && deposit_percent) {
			return `Deposit due (${Number(deposit_percent).toFixed(0)}%)`;
		}
		return 'Deposit due';
	});
</script>

<div class="rounded-xl border border-border bg-card p-4">
	<dl class="space-y-2 text-sm">
		<div class="flex justify-between">
			<dt class="text-muted-foreground">Subtotal</dt>
			<dd class="tabular-nums">{formatCurrency(subtotal)}</dd>
		</div>
		{#if discountNum > 0}
			<div class="flex justify-between">
				<dt class="text-emerald-600 dark:text-emerald-400">{discountText}</dt>
				<dd class="tabular-nums text-emerald-600 dark:text-emerald-400">
					−{formatCurrency(discount_amount ?? '0')}
				</dd>
			</div>
		{/if}
		<div class="flex justify-between">
			<dt class="text-muted-foreground">Tax ({taxPct})</dt>
			<dd class="tabular-nums">{formatCurrency(tax_amount)}</dd>
		</div>
		<div class="flex justify-between border-t border-border pt-2 text-base font-semibold">
			<dt>Total</dt>
			<dd class="tabular-nums">{formatCurrency(total)}</dd>
		</div>
		{#if deposit_required && deposit_amount}
			<div class="flex justify-between text-xs text-muted-foreground">
				<dt>{depositLabel}</dt>
				<dd class="tabular-nums">{formatCurrency(deposit_amount)}</dd>
			</div>
		{/if}
	</dl>

	{#if optionalItems.length > 0}
		<div class="mt-3 border-t border-dashed border-border pt-3">
			<p
				class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400"
			>
				Optional add-ons
			</p>
			<dl class="space-y-1 text-xs">
				{#each optionalItems as item, i (i)}
					<div class="flex justify-between gap-3">
						<dt class="truncate text-muted-foreground">{item.description || 'Untitled'}</dt>
						<dd class="shrink-0 tabular-nums text-muted-foreground">
							+{formatCurrency(item.total)}
						</dd>
					</div>
				{/each}
			</dl>
			<p class="mt-1.5 text-[11px] text-muted-foreground">
				Not included in the total — the customer can add these when accepting.
			</p>
		</div>
	{/if}
</div>
