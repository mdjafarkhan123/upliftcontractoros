<script lang="ts">
	import { goto } from '$app/navigation';
	import { formatCurrency } from '$lib/utils/format';
	import { toast } from '$lib/stores/toast.svelte';
	import SectionEditButton from '$lib/components/shared/SectionEditButton.svelte';
	import type { JobDetail, JobLineItemRow } from '$lib/types/jobs';
	import { Button } from '$lib/components/ui/button';

	let {
		job,
		canInvoice,
		onEdit
	}: {
		job: JobDetail;
		canInvoice: boolean;
		// When provided, a per-section "Edit" button opens the focused pricing editor.
		onEdit?: () => void;
	} = $props();

	const hasLines = $derived(job.line_items.length > 0);

	// Profitability (cost / profit / margin) now lives in JobCostingSection, which folds in
	// expenses too — this section stays focused on the customer-facing revenue lines.
	const taxPct = $derived((Number(job.tax_rate) * 100).toFixed(2));
	const discountNum = $derived(Number(job.discount_amount ?? 0));
	const discountText = $derived.by(() => {
		const base = job.discount_label?.trim() || 'Discount';
		if (job.discount_type === 'percent' && job.discount_value) {
			const v = Number(job.discount_value);
			return `${base} (${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)}%)`;
		}
		return base;
	});

	// Group lines by section_label for display, preserving order (lines are position-sorted).
	const sections = $derived.by(() => {
		const out: { label: string | null; items: JobLineItemRow[] }[] = [];
		for (const li of job.line_items) {
			const label = li.section_label ?? null;
			let sec = out.find((s) => s.label === label);
			if (!sec) {
				sec = { label, items: [] };
				out.push(sec);
			}
			sec.items.push(li);
		}
		return out;
	});

	let converting = $state(false);
	async function createInvoice() {
		converting = true;
		try {
			const res = await fetch(`/api/jobs/${job.id}/convert-to-invoice`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not create invoice.');
				return;
			}
			const d = body.data as {
				id: string;
				invoice_number_display: string;
				already_existed: boolean;
			};
			if (d.already_existed) {
				toast.info(`Invoice ${d.invoice_number_display} already exists`);
			} else {
				toast.success(`Invoice ${d.invoice_number_display} created`);
			}
			await goto(`/invoices/${d.id}`);
		} catch {
			toast.error('Network error. Please try again.');
		} finally {
			converting = false;
		}
	}
</script>

<section class="job-section">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="ri-receipt-line job-section__icon" aria-hidden="true"></i>
			<h2 class="job-section__title">Products &amp; Services</h2>
		</div>
		<div class="job-section__head-actions">
			{#if onEdit}
				<SectionEditButton onclick={onEdit} />
			{/if}
			{#if hasLines && canInvoice}
				<Button
					size="sm"
					variant={job.has_active_invoice ? 'secondary' : 'default'}
					loading={converting}
					onclick={createInvoice}
				>
					<i class="ri-file-text-line" aria-hidden="true"></i>
					{job.has_active_invoice ? 'View invoice' : 'Create invoice'}
				</Button>
			{/if}
		</div>
	</div>

	{#if !hasLines}
		<p class="job-section__empty">No products or services on this job.</p>
	{:else}
		<div class="job-lines__groups">
			{#each sections as sec (sec.label ?? '__ungrouped')}
				<div class="job-lines__group">
					{#if sec.label}
						<h3 class="job-lines__group-title">{sec.label}</h3>
					{/if}
					{#each sec.items as li (li.line_key)}
						<div class="job-lines__item">
							<div class="job-lines__item-main">
								<p class="job-lines__item-desc">{li.description}</p>
								{#if li.details}
									<p class="job-lines__item-details">{li.details}</p>
								{/if}
								<p class="job-lines__item-qty">
									{Number(li.quantity)}{li.unit ? ` ${li.unit}` : ''} × {formatCurrency(
										li.unit_price
									)}
									{#if li.taxable === false}
										<span class="job-lines__item-tax">Tax exempt</span>
									{/if}
								</p>
							</div>
							<span class="job-lines__item-total">{formatCurrency(li.total)}</span>
						</div>
					{/each}
				</div>
			{/each}
		</div>

		<dl class="job-lines__totals">
			<div class="job-lines__total-row">
				<dt class="job-lines__total-term">Subtotal</dt>
				<dd class="job-lines__total-val">{formatCurrency(job.subtotal)}</dd>
			</div>
			{#if discountNum > 0}
				<div class="job-lines__total-row">
					<dt class="job-lines__total-term--discount">{discountText}</dt>
					<dd class="job-lines__total-val--discount">
						−{formatCurrency(job.discount_amount ?? '0')}
					</dd>
				</div>
			{/if}
			<div class="job-lines__total-row">
				<dt class="job-lines__total-term">Tax ({taxPct}%)</dt>
				<dd class="job-lines__total-val">{formatCurrency(job.tax_amount)}</dd>
			</div>
			<div class="job-lines__total-row job-lines__total-row--grand">
				<dt>Total</dt>
				<dd class="job-lines__total-val">{formatCurrency(job.total)}</dd>
			</div>
		</dl>
	{/if}
</section>
