<script lang="ts">
	let {
		columns = 5,
		rows = 6,
		title = 'Loading'
	}: { columns?: number; rows?: number; title?: string } = $props();
</script>

<section class="jafar-skel-section" aria-busy="true" aria-label={title}>
	<header class="jafar-skel-section__head">
		<div>
			<div class="j-skel j-skel--h4" style="width: 8rem;"></div>
			<div class="j-skel j-skel--h3 j-skel--dim" style="width: 6rem; margin-top: 0.5rem;"></div>
		</div>
	</header>
	<div>
		{#each Array(rows) as _, r (r)}
			<div class="jafar-skel-section__row">
				{#each Array(columns) as _, c (c)}
					<div
						class="j-skel j-skel--h4 j-skel--dim"
						style="width: {c === 0 ? 22 : c === columns - 1 ? 10 : 14}%"
					></div>
				{/each}
			</div>
		{/each}
	</div>
</section>
