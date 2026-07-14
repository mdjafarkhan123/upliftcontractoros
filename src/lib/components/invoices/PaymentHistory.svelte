<script lang="ts">
	import { formatCurrency, formatDate } from '$lib/utils/format';
	import type { InvoicePaymentRow, PaymentMethod } from '$lib/types/invoices';

	let {
		payments,
		defaultCollapsed = true
	}: { payments: InvoicePaymentRow[]; defaultCollapsed?: boolean } = $props();

	let expanded = $derived(!defaultCollapsed);

	const methodLabels: Record<PaymentMethod, string> = {
		stripe: 'Stripe',
		cash: 'Cash',
		check: 'Check',
		bank_transfer: 'Bank transfer',
		other: 'Other'
	};

	const total = $derived(payments.reduce((s, p) => s + Number(p.amount), 0));
</script>

<div class="payment-history">
	<button type="button" onclick={() => (expanded = !expanded)} class="payment-history__toggle">
		<span class="payment-history__head">
			<i class="ri-receipt-line payment-history__icon" aria-hidden="true"></i>
			<span class="payment-history__title">Payment history</span>
			<span class="payment-history__meta">
				{payments.length}
				{payments.length === 1 ? 'payment' : 'payments'} · {formatCurrency(total)}
			</span>
		</span>
		<i
			class="payment-history__chevron {expanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}"
			aria-hidden="true"
		></i>
	</button>

	{#if expanded}
		<div class="payment-history__body">
			{#if payments.length === 0}
				<p class="payment-history__empty">No payments recorded yet.</p>
			{:else}
				<ul class="payment-history__list">
					{#each payments as p (p.id)}
						<li class="payment-history__item">
							<div>
								<p class="payment-history__amount">
									{formatCurrency(p.amount)}
									{#if Number(p.tip_amount) > 0}
										<span class="payment-history__tip">+ {formatCurrency(p.tip_amount)} tip</span>
									{/if}
								</p>
								<p class="payment-history__detail">
									{methodLabels[p.payment_method]} · {formatDate(p.paid_at)}
								</p>
								{#if p.recorded_by_name}
									<p class="payment-history__detail">Recorded by {p.recorded_by_name}</p>
								{/if}
								{#if p.notes}
									<p class="payment-history__note">{p.notes}</p>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
