<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

	import { createSelectLabels } from './labels.svelte.js';

	let {
		value = $bindable<string | undefined>(undefined),
		onValueChange,
		open = $bindable(false),
		disabled = false,
		required = false,
		name,
		items,
		children
	}: {
		value?: string | undefined;
		onValueChange?: (value: string) => void;
		open?: boolean;
		disabled?: boolean;
		required?: boolean;
		name?: string;
		/**
		 * The same option list you render with {#each}. This is Bits UI's documented pattern and
		 * the preferred one: it lets the closed trigger resolve its label from data (correct even
		 * on first paint, before the dropdown has ever been opened), and enables native-<select>
		 * style typeahead — focus the closed trigger, type, and it jumps to the matching option.
		 * Optional: without it the label registry below still keeps the trigger correct once the
		 * dropdown has been opened. See labels.svelte.ts.
		 */
		items?: { value: string; label: string; disabled?: boolean }[];
		children?: Snippet;
	} = $props();

	// Owns the value→label map that <Select.Item> fills and <Select.Value> reads. See labels.svelte.ts.
	createSelectLabels();
</script>

<SelectPrimitive.Root
	type="single"
	bind:value
	bind:open
	{onValueChange}
	{disabled}
	{required}
	{name}
	{items}
>
	{@render children?.()}
</SelectPrimitive.Root>
