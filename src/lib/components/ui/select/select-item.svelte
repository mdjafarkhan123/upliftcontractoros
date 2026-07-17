<script lang="ts">
	// `label` is REQUIRED, not decorative. Bits UI never reads the rendered children to work out
	// what the closed trigger should say — it stores `label` and defaults it to the raw `value`
	// when omitted, so a missing label silently renders "week1"/"job_start" in <Select.Value />
	// instead of the human text. Requiring it here turns that into a type error.
	import { Select as SelectPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { getSelectLabels } from './labels.svelte.js';

	let {
		class: className = '',
		value,
		label,
		disabled = false,
		children,
		...rest
	}: Omit<SelectPrimitive.ItemProps, 'label'> & {
		label: string;
		class?: string;
		children?: Snippet;
	} = $props();

	// Record the label so the closed trigger can still name this option after the dropdown closes
	// and this item unmounts. Re-runs if the label is dynamic ("Weekly on {weekday}").
	const labels = getSelectLabels();
	$effect(() => {
		labels?.set(value, label);
	});
</script>

<SelectPrimitive.Item
	{value}
	{label}
	{disabled}
	class={['ui-select__item', className].filter(Boolean).join(' ')}
	{...rest}
>
	<span style="display:flex;flex:1;align-items:center;gap:8px">
		{#if children}
			{@render children()}
		{:else}
			{label ?? value}
		{/if}
	</span>
	<i class="ri-check-line ui-select__item-check" aria-hidden="true"></i>
</SelectPrimitive.Item>
