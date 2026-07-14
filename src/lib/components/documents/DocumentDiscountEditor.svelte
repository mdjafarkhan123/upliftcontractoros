<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { formatCurrency } from '$lib/utils/format';

	// Shared document-level discount editor rendered by BOTH quotes/[id] and invoices/[id].
	// Presentation + input only — the parent owns persistence (PATCH), dirty tracking, and the
	// totals preview. `type` / `value` / `label` are $bindable so the parent's drafts stay the
	// source of truth. `subtotal` drives the live "−$X off" preview and the $↔% conversions.
	// `bare` strips the card frame so the editor can sit flush inside a parent section card
	// (quotes render it inside the "Discount" section block).
	let {
		type = $bindable('none'),
		value = $bindable(''),
		label = $bindable(''),
		subtotal,
		disabled = false,
		bare = false
	}: {
		type?: 'none' | 'fixed' | 'percent';
		value?: string;
		label?: string;
		subtotal: number;
		disabled?: boolean;
		bare?: boolean;
	} = $props();

	const valueNum = $derived.by(() => {
		const n = Number(value);
		return Number.isFinite(n) ? n : NaN;
	});
	// Dollars-off preview — matches recalc on the server (fixed clamps to subtotal, percent to 100%).
	const discountAmount = $derived.by(() => {
		if (type === 'none' || !Number.isFinite(valueNum)) return 0;
		if (type === 'percent') return Math.round(subtotal * Math.min(valueNum, 100)) / 100;
		return Math.min(valueNum, subtotal);
	});

	function toFixedMode() {
		if (type === 'percent' && discountAmount > 0) {
			value = discountAmount.toFixed(2);
		}
		type = 'fixed';
	}
	function toPercentMode() {
		if (type === 'fixed' && subtotal > 0 && Number.isFinite(valueNum) && valueNum > 0) {
			value = ((valueNum / subtotal) * 100).toFixed(1);
		}
		type = 'percent';
	}
</script>

<div class="doc-editor" class:doc-editor--bare={bare}>
	{#if bare}
		<!-- Parent section card supplies the "Discount" heading; keep only the hint here. -->
		<p class="doc-editor__hint doc-editor__hint--standalone">Applied to the subtotal before tax.</p>
	{:else}
		<div class="doc-editor__header">
			<div>
				<p class="doc-editor__title">Discount</p>
				<p class="doc-editor__hint">Applied to the subtotal before tax.</p>
			</div>
		</div>
	{/if}
	<div class="doc-editor__toggle">
		<button
			type="button"
			class="doc-editor__toggle-btn{type === 'none' ? ' doc-editor__toggle-btn--active' : ''}"
			{disabled}
			onclick={() => (type = 'none')}>None</button
		>
		<button
			type="button"
			class="doc-editor__toggle-btn{type === 'fixed' ? ' doc-editor__toggle-btn--active' : ''}"
			{disabled}
			onclick={toFixedMode}>$ Off</button
		>
		<button
			type="button"
			class="doc-editor__toggle-btn{type === 'percent' ? ' doc-editor__toggle-btn--active' : ''}"
			{disabled}
			onclick={toPercentMode}>% Off</button
		>
	</div>

	{#if type !== 'none'}
		<div class="doc-editor__fields">
			<div class="field">
				<Label for="discount-value" class="field__label">
					{type === 'percent' ? 'Percentage' : 'Amount (USD)'}
					<span class="field__required">*</span>
				</Label>
				<div style="position:relative;">
					<Input
						id="discount-value"
						type="number"
						inputmode="decimal"
						min="0.01"
						max={type === 'percent' ? '100' : undefined}
						step="0.01"
						placeholder={type === 'percent' ? '10' : '0.00'}
						class="field__input{type === 'percent' ? ' field__input--suffix' : ''}"
						{disabled}
						bind:value
					/>
					{#if type === 'percent'}
						<span class="doc-editor__field-suffix">%</span>
					{/if}
				</div>
				{#if discountAmount > 0}
					<p class="doc-editor__field-hint">
						−<strong>{formatCurrency(discountAmount)}</strong> off {formatCurrency(subtotal)} subtotal
					</p>
				{:else if subtotal === 0}
					<p class="doc-editor__field-hint">Add line items to preview the discount.</p>
				{/if}
			</div>
			<div class="field">
				<Label for="discount-label" class="field__label">Label (optional)</Label>
				<Input
					id="discount-label"
					type="text"
					maxlength={60}
					placeholder="e.g. Spring promo"
					class="field__input"
					{disabled}
					bind:value={label}
				/>
			</div>
		</div>
	{/if}
</div>
