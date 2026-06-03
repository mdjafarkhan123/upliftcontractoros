<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import type { Snippet } from 'svelte';
	import type { HTMLSelectAttributes } from 'svelte/elements';

	let {
		class: className = '',
		value = $bindable<string | number | undefined>(undefined),
		leading,
		children,
		...rest
	}: Omit<HTMLSelectAttributes, 'class' | 'value'> & {
		class?: string;
		value?: string | number | undefined;
		leading?: Snippet;
		children: Snippet;
	} = $props();
</script>

<div class="relative">
	{#if leading}
		<span
			class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground"
		>
			{@render leading()}
		</span>
	{/if}
	<select
		bind:value
		class={cn(
			'flex h-11 w-full appearance-none rounded-lg border border-input bg-background py-2 pr-9 text-sm text-foreground shadow-sm ring-offset-background transition-all focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-card-raised/70 dark:shadow-card',
			leading ? 'pl-10' : 'pl-3',
			className
		)}
		{...rest}
	>
		{@render children()}
	</select>
	<span
		class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-muted-foreground/70"
	>
		<ChevronsUpDown class="size-4" />
	</span>
</div>
