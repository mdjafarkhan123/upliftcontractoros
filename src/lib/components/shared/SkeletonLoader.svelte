<script lang="ts">
	import { cn } from '$lib/utils/cn';

	let {
		lines = 3,
		height = '18px',
		label = 'Loading'
	}: { lines?: number; height?: string; label?: string } = $props();
</script>

<div class="grid w-full gap-3" aria-label={label} aria-busy="true">
	{#each Array.from({ length: lines }, (_, i) => i) as i (i)}
		<div
			style:height
			class={cn('skeleton-shimmer rounded-sm bg-muted', i === lines - 1 && 'w-2/3')}
		></div>
	{/each}
</div>
