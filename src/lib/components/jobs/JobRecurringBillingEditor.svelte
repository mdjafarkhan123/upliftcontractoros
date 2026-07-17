<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import { formatCurrency } from '$lib/utils/format';
	import {
		BILLING_TYPE_LABEL,
		INVOICE_FREQUENCY_LABEL,
		type BillingType,
		type InvoiceFrequency
	} from '$lib/jobs/billing';
	import type { Snippet } from 'svelte';

	// Recurring-billing config for a recurring job. `enabled` is the master on/off —
	// when off, the job carries no recurring billing (billing_type stays null on save).
	// The summary line (Total invoices / First / Last) reuses the schedule preview the
	// page already computes, so the count always matches what creation produces.
	let {
		enabled = $bindable(),
		billingType = $bindable(),
		invoiceFrequency = $bindable(),
		fixedAmount = $bindable(),
		preview = null,
		previewLoading = false,
		showSummary = true,
		footer
	}: {
		enabled: boolean;
		billingType: BillingType;
		invoiceFrequency: InvoiceFrequency;
		fixedAmount: string;
		preview?: { count: number; first: string | null; last: string | null } | null;
		previewLoading?: boolean;
		showSummary?: boolean;
		footer?: Snippet;
	} = $props();

	const FREQUENCIES: InvoiceFrequency[] = ['per_visit', 'weekly', 'biweekly', 'monthly'];

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<div class="job-section">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="ri-refresh-line job-section__icon" aria-hidden="true"></i>
			<h2 class="job-section__title">Billing &amp; automatic payments</h2>
		</div>
	</div>

	<label class="job-billing__check">
		<input type="checkbox" bind:checked={enabled} />
		<span>Bill this job on a recurring schedule</span>
	</label>

	{#if enabled}
		<!-- Summary line — mirrors the reference "Total invoices N · First · Last".
		     Visit-based per-visit billing produces one invoice per visit, so the schedule
		     preview count is the natural estimate. For other cadences it's advisory. -->
		{#if showSummary}
			<p class="recur-billing__summary">
				{#if previewLoading}
					<span class="recur-billing__summary-loading">Calculating…</span>
				{:else if preview}
					<span><strong>{preview.count}</strong> invoice{preview.count === 1 ? '' : 's'}</span>
					<span class="recur-billing__summary-sep" aria-hidden="true">·</span>
					<span>First {fmtDate(preview.first)}</span>
					<span class="recur-billing__summary-sep" aria-hidden="true">·</span>
					<span>Last {fmtDate(preview.last)}</span>
				{:else}
					<span class="recur-billing__summary-loading">Set a schedule to preview invoices</span>
				{/if}
			</p>
		{/if}

		<div class="recur-billing__grid">
			<!-- Left: billing config -->
			<div class="recur-billing__config">
				<fieldset class="recur-billing__fieldset">
					<legend class="recur-billing__legend">Billing type</legend>

					<label
						class="recur-billing__radio"
						class:recur-billing__radio--active={billingType === 'visit_based'}
					>
						<input type="radio" bind:group={billingType} value="visit_based" />
						<span class="recur-billing__radio-body">
							<span class="recur-billing__radio-title">{BILLING_TYPE_LABEL.visit_based}</span>
							<span class="recur-billing__radio-desc">
								Visits are listed as billable items and grouped on one invoice.
							</span>
						</span>
					</label>

					<label
						class="recur-billing__radio"
						class:recur-billing__radio--active={billingType === 'fixed'}
					>
						<input type="radio" bind:group={billingType} value="fixed" />
						<span class="recur-billing__radio-body">
							<span class="recur-billing__radio-title">{BILLING_TYPE_LABEL.fixed}</span>
							<span class="recur-billing__radio-desc">Each invoice is for a set amount.</span>
						</span>
					</label>
				</fieldset>

				{#if billingType === 'fixed'}
					<div class="field recur-billing__amount">
						<label class="field__label" for="recur-fixed-amount">Invoice amount</label>
						<div class="recur-billing__amount-field">
							<span class="recur-billing__affix" aria-hidden="true">$</span>
							<input
								id="recur-fixed-amount"
								class="field__input"
								type="number"
								inputmode="decimal"
								min="0"
								step="0.01"
								bind:value={fixedAmount}
								placeholder="0.00"
							/>
						</div>
						<p class="field__hint">Tax-inclusive — charged each billing period.</p>
					</div>
				{/if}

				<div class="field recur-billing__freq">
					<label class="field__label" for="recur-frequency">Invoice frequency</label>
					<Select.Root bind:value={invoiceFrequency}>
						<Select.Trigger id="recur-frequency">
							<Select.Value />
						</Select.Trigger>
						<Select.Content>
							{#each FREQUENCIES as f (f)}
								<Select.Item value={f} label={INVOICE_FREQUENCY_LABEL[f]}>
									{INVOICE_FREQUENCY_LABEL[f]}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</div>

			<!-- Right: deferred auto-charge placeholder -->
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
		</div>
	{/if}
	{@render footer?.()}
</div>
