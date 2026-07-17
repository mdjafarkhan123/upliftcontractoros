<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { getSelectLabels } from './labels.svelte.js';

	let {
		placeholder = 'Select an option',
		...rest
	}: SelectPrimitive.ValueProps & { placeholder?: string } = $props();

	// Prefer the label our <Select.Item> registered over the one Bits UI resolves from the DOM:
	// Bits degrades to the raw value ("week1") once the dropdown has closed. Its label is still
	// the fallback for a value no item has ever registered — a preselected value on a dropdown
	// the user hasn't opened yet, where the registry has nothing better to offer.
	const labels = getSelectLabels();
</script>

<SelectPrimitive.Value {placeholder} {...rest}>
	{#snippet children({ selection })}
		{#if selection.type === 'single'}
			{@const selected = selection.selected}
			{selected ? (labels?.get(selected.value) ?? selected.label) : placeholder}
		{:else}
			{selection.selected.length
				? selection.selected.map((s) => labels?.get(s.value) ?? s.label).join(', ')
				: placeholder}
		{/if}
	{/snippet}
</SelectPrimitive.Value>
