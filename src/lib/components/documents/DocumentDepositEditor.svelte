<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { formatCurrency } from '$lib/utils/format';

	// Shared "Request a deposit" editor for quotes/[id] (and any future document that
	// collects an upfront deposit). Presentation + input only — the parent owns
	// persistence (PATCH), dirty tracking, and validation. `required` / `type` /
	// `amount` / `percent` are $bindable so the parent's drafts stay the source of
	// truth. `total` drives the live percent preview and the $↔% conversions.
	// Uses the shared `.doc-editor` chassis (see styles/components/_documents.scss).
	// `bare` strips the card frame (border/padding/shadow) so the editor can sit flush
	// inside a parent section card (quotes render it inside the "Deposit" section block).
	let {
		required = $bindable(false),
		type = $bindable('fixed'),
		amount = $bindable(''),
		percent = $bindable(''),
		total,
		disabled = false,
		bare = false
	}: {
		required?: boolean;
		type?: 'fixed' | 'percent';
		amount?: string;
		percent?: string;
		total: number;
		disabled?: boolean;
		bare?: boolean;
	} = $props();

	const amountNum = $derived.by(() => {
		const n = Number(amount);
		return Number.isFinite(n) ? n : NaN;
	});
	const percentNum = $derived.by(() => {
		const n = Number(percent);
		return Number.isFinite(n) && n > 0 ? n : NaN;
	});
	const previewAmount = $derived.by(() => {
		if (type !== 'percent') return null;
		if (!Number.isFinite(percentNum) || total <= 0) return null;
		return Math.round(((total * percentNum) / 100) * 100) / 100;
	});

	function toFixedMode() {
		if (type === 'percent' && previewAmount) {
			amount = previewAmount.toFixed(2);
		}
		type = 'fixed';
	}
	function toPercentMode() {
		if (type === 'fixed' && total > 0 && Number.isFinite(amountNum) && amountNum > 0) {
			percent = ((amountNum / total) * 100).toFixed(1);
		}
		type = 'percent';
	}
</script>

<div class="doc-editor" class:doc-editor--bare={bare}>
	<div class="doc-editor__header">
		<div>
			<p class="doc-editor__title">Request a deposit</p>
			<p class="doc-editor__hint">Client pays online after accepting.</p>
		</div>
		<Switch id="deposit-toggle" bind:checked={required} {disabled} />
	</div>

	{#if required}
		<div class="doc-editor__toggle">
			<button
				type="button"
				class="doc-editor__toggle-btn{type === 'fixed' ? ' doc-editor__toggle-btn--active' : ''}"
				{disabled}
				onclick={toFixedMode}>Fixed ($)</button
			>
			<button
				type="button"
				class="doc-editor__toggle-btn{type === 'percent' ? ' doc-editor__toggle-btn--active' : ''}"
				{disabled}
				onclick={toPercentMode}>Percent (%)</button
			>
		</div>

		<div class="doc-editor__fields">
			{#if type === 'fixed'}
				<div class="field">
					<Label for="deposit-amount" class="field__label">
						Amount (USD) <span class="field__required">*</span>
					</Label>
					<Input
						id="deposit-amount"
						type="number"
						inputmode="decimal"
						min="0.01"
						step="0.01"
						placeholder="0.00"
						class="field__input"
						bind:value={amount}
						{disabled}
					/>
					{#if !disabled && total > 0 && Number.isFinite(amountNum) && amountNum >= total}
						<p class="field__error">Must be less than the quote total.</p>
					{/if}
				</div>
			{:else}
				<div class="field">
					<Label for="deposit-percent" class="field__label">
						Percentage <span class="field__required">*</span>
					</Label>
					<div style="position:relative;">
						<Input
							id="deposit-percent"
							type="number"
							inputmode="decimal"
							min="0.01"
							max="99.99"
							step="0.01"
							placeholder="25"
							class="field__input field__input--suffix"
							bind:value={percent}
							{disabled}
						/>
						<span class="doc-editor__field-suffix">%</span>
					</div>
					{#if previewAmount !== null}
						<p class="doc-editor__field-hint">
							≈ <strong>{formatCurrency(previewAmount)}</strong> of {formatCurrency(total)} total
						</p>
					{:else if total === 0}
						<p class="doc-editor__field-hint">Add line items to see the deposit amount.</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
