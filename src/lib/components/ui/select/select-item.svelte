<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import Check from '@lucide/svelte/icons/check';
	import { cn } from '$lib/utils/cn';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		value,
		label,
		disabled = false,
		children,
		...rest
	}: SelectPrimitive.ItemProps & { class?: string; children?: Snippet } = $props();
</script>

<SelectPrimitive.Item
	{value}
	{label}
	{disabled}
	class={cn(
		'group relative flex min-h-11 w-full cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors duration-150 sm:min-h-9',
		'text-foreground',
		'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
		'data-[selected]:font-medium data-[selected]:text-primary',
		'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
		className
	)}
	{...rest}
>
	<span class="flex flex-1 items-center gap-2">
		{#if children}
			{@render children()}
		{:else}
			{label ?? value}
		{/if}
	</span>
	<Check class="size-3.5 shrink-0 text-primary opacity-0 group-data-[selected]:opacity-100" />
</SelectPrimitive.Item>
