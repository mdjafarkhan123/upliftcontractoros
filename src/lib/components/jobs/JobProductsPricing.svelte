<script lang="ts">
	// Shared "Products & Services" editor for the job form — line items + discount/tax + live
	// totals. Used by both /jobs/new and the /jobs/[id] edit mode so the pricing block can't
	// drift. Reads/writes the shared JobFormState; totals come from the model's $derived fields
	// (the same formulas the server's recalcJobTotals uses).
	import * as Select from '$lib/components/ui/select';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import LineItemEditor from '$lib/components/quotes/LineItemEditor.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import { getMemberContext } from '$lib/context/member';
	import { getOrgContext } from '$lib/context/org';
	import type { JobFormState } from '$lib/jobs/jobForm.svelte';
	import type { Snippet } from 'svelte';

	let {
		form,
		errors = {},
		loading = false,
		footer
	}: {
		form: JobFormState;
		errors?: Record<string, string>;
		loading?: boolean;
		footer?: Snippet;
	} = $props();

	// Internal cost + profit/margin is revenue-only, gated identically to quotes.
	const member = getMemberContext();
	const org = getOrgContext();

	// The line-item actions live in the section header (not scattered below). The catalog
	// picker opens via `catalogOpen`; add-item / add-section run through the editor's
	// bindable `controls` handle.
	let catalogOpen = $state(false);
	let editorControls = $state<{ addItem: () => void; addSection: () => void } | undefined>();
</script>

<div class="job-section">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="job-section__icon ri-briefcase-2-line" aria-hidden="true"></i>
			<span class="job-section__title">Products / Services</span>
		</div>
		{#if !loading}
			<div class="job-section__head-actions">
				<Button variant="outline" size="sm" onclick={() => (catalogOpen = true)}>
					<i class="ri-book-2-line" aria-hidden="true"></i>Add from price book
				</Button>
				<Button variant="outline" size="sm" onclick={() => editorControls?.addItem()}>
					<i class="ri-add-line" aria-hidden="true"></i>Add item
				</Button>
				<Button variant="ghost" size="sm" onclick={() => editorControls?.addSection()}>
					<i class="ri-stack-line" aria-hidden="true"></i>Add section
				</Button>
			</div>
		{/if}
	</div>

	{#if loading}
		<SkeletonLoader lines={3} />
	{:else}
		<LineItemEditor
			bind:lineItems={form.lineItems}
			enableCatalog
			enableOptional={false}
			enableTax
			hoistActions
			bind:catalogOpen
			bind:controls={editorControls}
			showCost={member().can_view_revenue}
			targetMarginPct={org().target_margin_pct}
		/>

		{#if form.lineItems.length > 0}
			<div class="job-pricing-inputs">
				<div class="field">
					<p class="field__label">Discount</p>
					<div class="job-discount-row">
						<Select.Root bind:value={form.discountType}>
							<Select.Trigger><Select.Value /></Select.Trigger>
							<Select.Content>
								<Select.Item value="none">None</Select.Item>
								<Select.Item value="percent">Percent</Select.Item>
								<Select.Item value="fixed">Fixed $</Select.Item>
							</Select.Content>
						</Select.Root>
						{#if form.discountType !== 'none'}
							<Input
								type="number"
								inputmode="decimal"
								min="0"
								step="0.01"
								placeholder={form.discountType === 'percent' ? '%' : '$'}
								bind:value={form.discountValue}
							/>
						{/if}
					</div>
					{#if errors.discount_value}
						<p class="field__error">{errors.discount_value}</p>
					{/if}
					{#if form.discountType !== 'none'}
						<Input
							bind:value={form.discountLabel}
							placeholder="Discount label (e.g. Spring promo)"
							maxlength={60}
						/>
					{/if}
				</div>
				<div class="field">
					<label class="field__label" for="tax-rate">Tax rate (%)</label>
					<Input
						id="tax-rate"
						type="number"
						inputmode="decimal"
						min="0"
						step="0.01"
						placeholder="e.g. 8.25"
						bind:value={form.taxRatePct}
					/>
				</div>
			</div>

			<div class="job-edit-summary">
				<dl class="job-edit-summary__list">
					<div class="job-edit-summary__row">
						<dt class="job-edit-summary__term">Subtotal</dt>
						<dd class="job-edit-summary__val">{formatCurrency(form.subtotal)}</dd>
					</div>
					{#if form.discountAmount > 0}
						<div class="job-edit-summary__row job-edit-summary__row--discount">
							<dt class="job-edit-summary__term">
								{form.discountLabel.trim() || 'Discount'}{form.discountType === 'percent' &&
								Number(form.discountValue) > 0
									? ` (${Number(form.discountValue)}%)`
									: ''}
							</dt>
							<dd class="job-edit-summary__val">−{formatCurrency(form.discountAmount)}</dd>
						</div>
					{/if}
					<div class="job-edit-summary__row">
						<dt class="job-edit-summary__term">Tax ({(form.taxRate * 100).toFixed(2)}%)</dt>
						<dd class="job-edit-summary__val">{formatCurrency(form.taxAmount)}</dd>
					</div>
					<div class="job-edit-summary__row job-edit-summary__row--total">
						<dt class="job-edit-summary__term">Total</dt>
						<dd class="job-edit-summary__val">{formatCurrency(form.total)}</dd>
					</div>
				</dl>
			</div>
		{/if}
	{/if}
	{@render footer?.()}
</div>
