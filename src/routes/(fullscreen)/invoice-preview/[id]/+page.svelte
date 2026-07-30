<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import DocumentTotalsCard from '$lib/components/documents/DocumentTotalsCard.svelte';
	import { formatCurrency, formatDate } from '$lib/utils/format';
	import type { InvoiceDetail } from '$lib/types/invoices';

	let { data }: { data: { invoice: InvoiceDetail | null } } = $props();

	function closePreview() {
		window.close();
		history.back();
	}
</script>

<svelte:head>
	<title
		>{data.invoice ? `Preview — ${data.invoice.invoice_number_display}` : 'Invoice preview'}</title
	>
</svelte:head>

<div class="invoice-preview__banner">
	<div class="invoice-preview__banner-info">
		<i class="ri-eye-line" aria-hidden="true"></i>
		<span>This is the customer-facing invoice preview. Actions are disabled.</span>
	</div>
	<Button variant="ghost" size="sm" onclick={closePreview}>
		<i class="ri-close-line" aria-hidden="true"></i>Close
	</Button>
</div>

<main class="invoice-preview">
	{#if !data.invoice}
		<section class="invoice-preview__empty">
			<h1>Preview unavailable</h1>
			<p>This invoice could not be loaded. It may have been deleted.</p>
		</section>
	{:else}
		{@const invoice = data.invoice}
		<section class="invoice-preview__document">
			<header class="invoice-preview__header">
				<div>
					<p class="invoice-preview__eyebrow">Invoice {invoice.invoice_number_display}</p>
					<h1>{invoice.title}</h1>
					<p class="invoice-preview__recipient">Prepared for {invoice.contact_name}</p>
				</div>
				<div class="invoice-preview__dates">
					<span>Issued {formatDate(invoice.created_at)}</span>
					{#if invoice.due_date}<span>Due {formatDate(invoice.due_date)}</span>{/if}
				</div>
			</header>

			<section class="invoice-preview__lines" aria-labelledby="invoice-lines-title">
				<h2 id="invoice-lines-title">Services</h2>
				{#if invoice.line_items.filter((line) => !line.is_late_fee).length === 0}
					<p class="invoice-preview__muted">No line items have been added yet.</p>
				{:else}
					{#each invoice.line_items.filter((line) => !line.is_late_fee) as line (line.id)}
						<div class="invoice-preview__line">
							<div>
								<strong>{line.description}</strong>
								<span
									>{line.quantity}{line.unit ? ` ${line.unit}` : ''} × {formatCurrency(
										line.unit_price
									)}</span
								>
							</div>
							<strong>{formatCurrency(line.total)}</strong>
						</div>
					{/each}
				{/if}
			</section>

			<div class="invoice-preview__totals">
				<DocumentTotalsCard
					subtotal={invoice.subtotal}
					discount_type={invoice.discount_type}
					discount_value={invoice.discount_value}
					discount_amount={invoice.discount_amount}
					discount_label={invoice.discount_label}
					tax_rate={invoice.tax_rate}
					tax_amount={invoice.tax_amount}
					total={invoice.total}
					amount_paid={invoice.amount_paid}
					amount_due={invoice.amount_due}
					tip_total={invoice.tip_total}
					late_fee_total={invoice.late_fee_total}
				/>
			</div>

			{#if invoice.notes}
				<section class="invoice-preview__copy">
					<h2>Notes</h2>
					<p>{invoice.notes}</p>
				</section>
			{/if}
			{#if invoice.terms}
				<section class="invoice-preview__copy">
					<h2>Terms</h2>
					<p>{invoice.terms}</p>
				</section>
			{/if}
		</section>
	{/if}
</main>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.invoice-preview__banner {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-3;
		padding: $space-2 $space-4;
		border-bottom: 1px solid var(--warning-solid);
		background: var(--warning-bg);
		color: var(--warning-text);
	}

	.invoice-preview__banner-info {
		display: flex;
		align-items: center;
		gap: $space-2;
	}
	.invoice-preview__banner-info span {
		font-size: $fs-body;
		font-weight: $weight-medium;
	}
	.invoice-preview {
		min-height: 100vh;
		padding: $space-10 $space-4;
		background: var(--color-bg-app);
	}
	.invoice-preview__document {
		max-width: 960px;
		margin: 0 auto;
		padding: $space-8;
		border: 1px solid var(--color-border);
		border-radius: $radius-2xl;
		background: var(--color-bg-surface);
		box-shadow: var(--shadow-md);
	}
	.invoice-preview__header {
		display: flex;
		justify-content: space-between;
		gap: $space-6;
		padding-bottom: $space-6;
		border-bottom: 1px solid var(--color-border);
	}
	.invoice-preview h1 {
		margin: $space-2 0;
		color: var(--color-text-primary);
		font-size: $fs-h1;
	}
	.invoice-preview h2 {
		margin: 0 0 $space-3;
		color: var(--color-text-primary);
		font-size: $fs-h3;
	}
	.invoice-preview__eyebrow {
		margin: 0;
		color: var(--color-brand);
		font-size: $fs-body;
		font-weight: $weight-semibold;
	}
	.invoice-preview__recipient,
	.invoice-preview__dates,
	.invoice-preview__muted,
	.invoice-preview__copy p {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: $fs-body;
	}
	.invoice-preview__dates {
		display: flex;
		flex-direction: column;
		gap: $space-2;
		text-align: right;
	}
	.invoice-preview__lines,
	.invoice-preview__copy {
		margin-top: $space-6;
	}
	.invoice-preview__line {
		display: flex;
		justify-content: space-between;
		gap: $space-4;
		padding: $space-4 0;
		border-bottom: 1px solid var(--color-border);
		color: var(--color-text-primary);
	}
	.invoice-preview__line div {
		display: flex;
		flex-direction: column;
		gap: $space-1;
	}
	.invoice-preview__line span {
		color: var(--color-text-secondary);
		font-size: $fs-body;
	}
	.invoice-preview__totals {
		max-width: 420px;
		margin: $space-6 0 0 auto;
	}
	.invoice-preview__empty {
		max-width: 640px;
		margin: 0 auto;
		padding: $space-8;
		border: 1px solid var(--color-border);
		border-radius: $radius-2xl;
		background: var(--color-bg-surface);
		text-align: center;
	}
	.invoice-preview__empty h1 {
		font-size: $fs-h3;
	}
	.invoice-preview__empty p {
		color: var(--color-text-secondary);
		font-size: $fs-body;
	}

	@media (max-width: 640px) {
		.invoice-preview__document {
			padding: $space-4;
		}
		.invoice-preview__header {
			flex-direction: column;
		}
		.invoice-preview__dates {
			text-align: left;
		}
	}
</style>
