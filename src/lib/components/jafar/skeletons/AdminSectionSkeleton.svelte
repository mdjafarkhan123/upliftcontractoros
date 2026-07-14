<script lang="ts">
	let {
		titleWidth = 'w-32',
		bodyRows = 3,
		grid = false
	}: { titleWidth?: string; bodyRows?: number; grid?: boolean } = $props();

	void titleWidth;
</script>

<section class="jafar-skel-section">
	<header class="jafar-skel-section__head">
		<div>
			<div class="j-skel j-skel--h4" style="width: 8rem;"></div>
			<div class="j-skel j-skel--h3 j-skel--dim" style="width: 12rem; margin-top: 0.5rem;"></div>
		</div>
	</header>
	<div class="skel-body">
		{#if grid}
			<div class="skel-grid">
				{#each Array(bodyRows) as _, i (i)}
					<div class="skel-block"></div>
				{/each}
			</div>
		{:else}
			<div class="skel-list">
				{#each Array(bodyRows) as _, i (i)}
					<div class="j-skel j-skel--h4 j-skel--dim" style="width: {90 - i * 8}%;"></div>
				{/each}
			</div>
		{/if}
	</div>
</section>

<style lang="scss">
	.skel-body {
		padding: 1.25rem;
	}

	.skel-grid {
		display: grid;
		gap: 0.75rem;
		@media (min-width: 640px) {
			grid-template-columns: 1fr 1fr;
		}
	}

	.skel-block {
		height: 3rem;
		border-radius: 0.5rem;
		background: rgba(30, 41, 59, 0.6);
		animation: jafar-pulse 2s ease-in-out infinite;
	}

	.skel-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
</style>
