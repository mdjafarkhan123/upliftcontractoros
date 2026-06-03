<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import { cn } from '$lib/utils/cn';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		ref = $bindable(null),
		children,
		...rest
	}: SelectPrimitive.TriggerProps & { class?: string; children?: Snippet } = $props();
</script>

<SelectPrimitive.Trigger
	bind:ref
	class={cn(
		'flex h-11 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm ring-offset-background transition-all',
		'hover:border-border focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
		'disabled:cursor-not-allowed disabled:opacity-50',
		'dark:border-white/10 dark:bg-card-raised/70',
		'data-[placeholder]:text-muted-foreground',
		className
	)}
	{...rest}
>
	{@render children?.()}
	<ChevronsUpDown class="size-4 shrink-0 text-muted-foreground/70" />
</SelectPrimitive.Trigger>
