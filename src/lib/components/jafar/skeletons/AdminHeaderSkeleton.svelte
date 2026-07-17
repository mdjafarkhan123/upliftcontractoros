<script lang="ts">
	let { withPill = true }: { withPill?: boolean } = $props();
</script>

<div class="jafar-skel-hd">
	<div class="jafar-skel-hd__circle"></div>
	<div class="jafar-skel-hd__lines">
		<div class="skel-title-row">
			<div class="j-skel j-skel--h6" style="width: 14rem;"></div>
			{#if withPill}
				<div
					class="j-skel j-skel--h5 j-skel--dim"
					style="width: 5rem; border-radius: 9999px;"
				></div>
			{/if}
		</div>
		<div class="j-skel j-skel--h3 j-skel--dim" style="width: 18rem;"></div>
	</div>
</div>

<style lang="scss">
	.skel-title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}
</style>
