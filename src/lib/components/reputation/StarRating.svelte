<script lang="ts">
	import { Star } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';

	let {
		score,
		size = 'sm',
		class: className = ''
	}: {
		score: number;
		size?: 'sm' | 'md' | 'lg';
		class?: string;
	} = $props();

	const dim = $derived(size === 'lg' ? 'h-5 w-5' : size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5');
</script>

<div class={cn('inline-flex items-center gap-0.5', className)} aria-label={`${score} out of 5 stars`}>
	{#each [1, 2, 3, 4, 5] as i (i)}
		<Star
			class={cn(
				dim,
				i <= score ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'
			)}
		/>
	{/each}
</div>
