<script lang="ts">
	import { cn } from '$lib/utils/cn';

	let { lines = 3, label = 'Loading' }: { lines?: number; label?: string } = $props();
</script>

<div class="grid w-full gap-3" aria-label={label} aria-busy="true">
	{#each Array.from({ length: lines }, (_, i) => i) as i (i)}
		<div class={cn('h-[18px] animate-pulse rounded-sm bg-muted', i === lines - 1 && 'w-2/3')}></div>
	{/each}
</div>
