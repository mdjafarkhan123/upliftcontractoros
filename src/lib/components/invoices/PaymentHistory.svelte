<script lang="ts">
	import { formatCurrency, formatDate } from '$lib/utils/format';
	import type { InvoicePaymentRow, PaymentMethod } from '$lib/types/invoices';
	import { ChevronDown, ChevronUp, Receipt } from '@lucide/svelte';

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

<div class="rounded-xl border border-border bg-card">
	<button
		type="button"
		onclick={() => (expanded = !expanded)}
		class="flex w-full items-center justify-between gap-2 p-4 text-left"
	>
		<div class="flex items-center gap-2">
			<Receipt class="h-4 w-4 text-muted-foreground" />
			<span class="text-sm font-semibold">Payment history</span>
			<span class="text-xs text-muted-foreground">
				{payments.length} {payments.length === 1 ? 'payment' : 'payments'} · {formatCurrency(total)}
			</span>
		</div>
		{#if expanded}
			<ChevronUp class="h-4 w-4 text-muted-foreground" />
		{:else}
			<ChevronDown class="h-4 w-4 text-muted-foreground" />
		{/if}
	</button>

	{#if expanded}
		<div class="border-t border-border">
			{#if payments.length === 0}
				<p class="p-4 text-sm text-muted-foreground">No payments recorded yet.</p>
			{:else}
				<ul class="divide-y divide-border">
					{#each payments as p (p.id)}
						<li class="flex items-start justify-between gap-3 p-4">
							<div class="min-w-0">
								<p class="text-sm font-medium">{formatCurrency(p.amount)}</p>
								<p class="text-xs text-muted-foreground">
									{methodLabels[p.payment_method]} · {formatDate(p.paid_at)}
								</p>
								{#if p.recorded_by_name}
									<p class="text-xs text-muted-foreground">Recorded by {p.recorded_by_name}</p>
								{/if}
								{#if p.notes}
									<p class="mt-1 text-xs text-muted-foreground">{p.notes}</p>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
