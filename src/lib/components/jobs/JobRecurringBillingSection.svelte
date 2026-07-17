<script lang="ts">
	import { goto } from '$app/navigation';
	import { formatCurrency } from '$lib/utils/format';
	import { toast } from '$lib/stores/toast.svelte';
	import {
		BILLING_TYPE_LABEL,
		INVOICE_FREQUENCY_LABEL,
		type BillingType,
		type InvoiceFrequency
	} from '$lib/jobs/billing';
	import SectionEditButton from '$lib/components/shared/SectionEditButton.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { JobDetail } from '$lib/types/jobs';

	let {
		job,
		canInvoice,
		onEdit
	}: {
		job: JobDetail;
		canInvoice: boolean;
		// When provided, a per-section "Edit" button opens the focused billing editor.
		onEdit?: () => void;
	} = $props();

	const billingType = $derived(job.billing_type as BillingType | null);
	const frequency = $derived(job.invoice_frequency as InvoiceFrequency | null);

	let generating = $state(false);

	// Manual v1: contractor presses this to roll the current period into a draft invoice.
	// Visit-based bills past unbilled visits onto one invoice; fixed bills a flat amount.
	async function generateInvoice() {
		generating = true;
		try {
			const res = await fetch(`/api/jobs/${job.id}/generate-invoice`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not generate the invoice.');
				return;
			}
			const d = body.data as { id: string; invoice_number_display: string; visit_count: number };
			toast.success(`Invoice ${d.invoice_number_display} created`);
			await goto(`/invoices/${d.id}`);
		} catch {
			toast.error('Network error. Please try again.');
		} finally {
			generating = false;
		}
	}
</script>

<section class="job-section">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="ri-refresh-line job-section__icon" aria-hidden="true"></i>
			<h2 class="job-section__title">Billing &amp; automatic payments</h2>
		</div>
		{#if onEdit}
			<SectionEditButton onclick={onEdit} />
		{/if}
	</div>

	{#if !billingType}
		<p class="job-section__empty">
			No recurring billing set up. Bill each visit or a fixed amount on a schedule.
		</p>
	{:else}
		<dl class="recur-billing__view">
			<div class="recur-billing__view-row">
				<dt>Billing type</dt>
				<dd>
					{BILLING_TYPE_LABEL[billingType]}
					{#if billingType === 'fixed' && job.fixed_invoice_amount}
						· {formatCurrency(Number(job.fixed_invoice_amount))} per invoice
					{/if}
				</dd>
			</div>
			{#if frequency}
				<div class="recur-billing__view-row">
					<dt>Invoice frequency</dt>
					<dd>{INVOICE_FREQUENCY_LABEL[frequency]}</dd>
				</div>
			{/if}
		</dl>

		<div class="recur-billing__view-actions">
			{#if canInvoice}
				<Button size="sm" loading={generating} loadingLabel="Generating…" onclick={generateInvoice}>
					<i class="ri-add-line" aria-hidden="true"></i> Generate invoice
				</Button>
				<p class="recur-billing__view-hint">
					{#if billingType === 'visit_based'}
						Rolls every completed, unbilled visit into a draft invoice for review.
					{:else}
						Creates a draft invoice for the fixed amount for this period.
					{/if}
				</p>
			{/if}
		</div>

		<aside class="recur-billing__auto">
			<h3 class="recur-billing__auto-title">
				<i class="ri-bank-card-line" aria-hidden="true"></i> Get paid automatically
			</h3>
			<p class="recur-billing__auto-text">
				Clients are automatically invoiced and charged based on their billing frequency once they
				save a payment method on file.
			</p>
			<span class="recur-billing__auto-badge">Coming soon</span>
		</aside>
	{/if}
</section>
