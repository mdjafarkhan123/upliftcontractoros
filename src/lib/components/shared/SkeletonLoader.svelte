<script lang="ts">
	let {
		lines = 3,
		height = '18px',
		label = 'Loading'
	}: { lines?: number; height?: string; label?: string } = $props();
</script>

<div class="skeleton-loader" aria-label={label} aria-busy="true">
	{#each Array.from({ length: lines }, (_, i) => i) as i (i)}
		<div class="skeleton-loader__line skeleton-shimmer" style:height></div>
	{/each}
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.skeleton-loader {
		display: grid;
		width: 100%;
		gap: $space-3;

		&__line {
			width: 100%;

			&:last-child {
				width: 66.6667%;
			}
		}
	}
</style>
