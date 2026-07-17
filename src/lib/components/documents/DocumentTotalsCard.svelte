<script lang="ts">
	import { formatCurrency } from '$lib/utils/format';

	// Shared totals card rendered by BOTH quotes/[id] and invoices/[id]. Presentation-only
	// chrome — per-document features toggle via default-off props so neither document sees the
	// other's rows (Jobber "one screen underneath" model):
	//   • discount row     — shown when discount_amount > 0 (quote + invoice both)
	//   • deposit row      — QUOTE only (deposit_required + deposit_amount)
	//   • optional add-ons — QUOTE only (optionalItems)
	//   • paid / balance   — INVOICE only (amount_paid present and > 0)
	let {
		subtotal,
		// Document-level discount applied before tax. discount_amount is the dollars-off;
		// discount_type/value drive the "(10%)" label suffix. Row hidden when amount <= 0.
		discount_type = 'none',
		discount_value = null,
		discount_amount = null,
		discount_label = null,
		tax_rate,
		tax_amount,
		total,
		// Quote-only deposit row.
		deposit_required = false,
		deposit_type = 'fixed',
		deposit_percent = null,
		deposit_amount = null,
		// Quote-only optional add-on lines shown below the total as "not included".
		optionalItems = [],
		// Invoice-only paid / balance rows. Shown when amount_paid is provided and > 0.
		amount_paid = undefined,
		amount_due = undefined,
		// Invoice-only tip row (M7). Extra money collected on top of the balance — shown as its
		// own row when > 0, never folded into Total/Balance. QUOTES NEVER PASS THIS → no leak.
		tip_total = undefined,
		// Invoice-only late-fee row (M8). Real money added to the balance AFTER tax — shown as its
		// own row (Subtotal → Tax → Late fee → Total) so it's never discounted or taxed. Already
		// folded into `total`. QUOTES NEVER PASS THIS → no leak.
		late_fee_total = undefined
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
		amount_paid?: string | null;
		amount_due?: string | null;
		tip_total?: string | null;
		late_fee_total?: string | null;
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
	const showBalance = $derived(
		amount_paid !== undefined && amount_paid !== null && Number(amount_paid) > 0
	);
	const tipNum = $derived(Number(tip_total ?? 0));
	const lateFeeNum = $derived(Number(late_fee_total ?? 0));
</script>

<dl class="doc-totals">
	<div class="doc-totals__row">
		<dt class="doc-totals__term">Subtotal</dt>
		<dd class="doc-totals__value">{formatCurrency(subtotal)}</dd>
	</div>
	{#if discountNum > 0}
		<div class="doc-totals__row">
			<dt class="doc-totals__discount-term">{discountText}</dt>
			<dd class="doc-totals__value doc-totals__value--discount">
				−{formatCurrency(discount_amount ?? '0')}
			</dd>
		</div>
	{/if}
	<div class="doc-totals__row">
		<dt class="doc-totals__term">Tax ({taxPct})</dt>
		<dd class="doc-totals__value">{formatCurrency(tax_amount)}</dd>
	</div>
	{#if lateFeeNum > 0}
		<div class="doc-totals__row">
			<dt class="doc-totals__term">Late fee</dt>
			<dd class="doc-totals__value">{formatCurrency(late_fee_total ?? '0')}</dd>
		</div>
	{/if}
	<div class="doc-totals__divider"></div>
	<div class="doc-totals__total-row">
		<dt class="doc-totals__total-term">Total</dt>
		<dd class="doc-totals__total-value">{formatCurrency(total)}</dd>
	</div>

	{#if deposit_required && deposit_amount}
		<div class="doc-totals__deposit-row">
			<dt>{depositLabel}</dt>
			<dd class="doc-totals__deposit-value">{formatCurrency(deposit_amount)}</dd>
		</div>
	{/if}

	{#if showBalance && amount_paid && amount_due}
		<div class="doc-totals__paid-row">
			<dt>Paid</dt>
			<dd class="doc-totals__paid-value">{formatCurrency(amount_paid)}</dd>
		</div>
		<div class="doc-totals__balance-row">
			<dt>Balance due</dt>
			<dd class="doc-totals__balance-value">{formatCurrency(amount_due)}</dd>
		</div>
	{/if}

	{#if tipNum > 0}
		<div class="doc-totals__paid-row">
			<dt>Tip collected</dt>
			<dd class="doc-totals__paid-value">{formatCurrency(tip_total ?? '0')}</dd>
		</div>
	{/if}

	{#if optionalItems.length > 0}
		<div class="doc-totals__addons">
			<p class="doc-totals__addons-label">Optional add-ons</p>
			<dl>
				{#each optionalItems as item, i (i)}
					<div class="doc-totals__addon-row">
						<dt class="doc-totals__addon-desc">{item.description || 'Untitled'}</dt>
						<dd class="doc-totals__addon-val">+{formatCurrency(item.total)}</dd>
					</div>
				{/each}
			</dl>
			<p class="doc-totals__addons-hint">
				Not included in the total — the customer can add these when accepting.
			</p>
		</div>
	{/if}
</dl>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.doc-totals {
		padding: $space-4;
		border: 1px solid var(--color-border);
		border-radius: $radius-xl;
		background: var(--color-bg-surface);
		box-shadow: var(--shadow-sm);

		&__row {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			font-size: $fs-body;
			padding: $space-1 0;
		}

		&__term {
			color: var(--color-text-secondary);
		}

		&__value {
			font-variant-numeric: tabular-nums;
			color: var(--color-text-primary);

			&--discount {
				color: var(--success-text);
			}
		}

		&__discount-term {
			color: var(--success-text);
		}

		&__divider {
			height: 1px;
			background: var(--color-border);
			margin: $space-2 0;
		}

		&__total-row {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			font-size: $fs-lg;
			font-weight: $weight-semibold;
			padding: $space-1 0;
		}

		&__total-term {
			color: var(--color-text-primary);
		}

		&__total-value {
			font-variant-numeric: tabular-nums;
			color: var(--color-text-primary);
		}

		&__deposit-row {
			display: flex;
			justify-content: space-between;
			font-size: $fs-caption;
			color: var(--color-text-muted);
			padding-top: $space-2;
		}

		&__deposit-value {
			font-variant-numeric: tabular-nums;
		}

		&__paid-row {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			padding: $space-1 0;
			font-size: $fs-caption;
			color: var(--color-text-muted);
		}

		&__paid-value {
			font-variant-numeric: tabular-nums;
		}

		&__balance-row {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			padding: $space-1 0;
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
		}

		&__balance-value {
			font-variant-numeric: tabular-nums;
		}

		&__addons {
			margin-top: $space-3;
			padding-top: $space-3;
			border-top: 1px dashed var(--color-border);
		}

		&__addons-label {
			font-size: $fs-caption;
			font-weight: $weight-semibold;
			text-transform: uppercase;
			letter-spacing: $tracking-label;
			color: #d97706;
			margin-bottom: $space-2;
		}

		&__addon-row {
			display: flex;
			justify-content: space-between;
			gap: $space-2;
			padding: $space-1 0;
			font-size: $fs-caption;
		}

		&__addon-desc {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			color: var(--color-text-muted);
		}

		&__addon-val {
			flex-shrink: 0;
			font-variant-numeric: tabular-nums;
			color: var(--color-text-muted);
		}

		&__addons-hint {
			margin-top: $space-1;
			font-size: $fs-caption;
			color: var(--color-text-muted);
			line-height: $lh-body;
		}
	}

	:global(:root[data-theme='dark']) .doc-totals__addons-label {
		color: #fbbf24;
	}
</style>
