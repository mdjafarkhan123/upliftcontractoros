<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		value = $bindable<string | undefined>(undefined),
		onValueChange,
		open = $bindable(false),
		disabled = false,
		required = false,
		name,
		children
	}: {
		value?: string | undefined;
		onValueChange?: (value: string) => void;
		open?: boolean;
		disabled?: boolean;
		required?: boolean;
		name?: string;
		children?: Snippet;
	} = $props();
</script>

<SelectPrimitive.Root
	type="single"
	bind:value
	bind:open
	{onValueChange}
	{disabled}
	{required}
	{name}
>
	{@render children?.()}
</SelectPrimitive.Root>
