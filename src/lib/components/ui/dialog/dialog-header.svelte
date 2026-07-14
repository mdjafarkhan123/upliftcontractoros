<script lang="ts">
	let { class: className = '', children }: { class?: string; children?: import('svelte').Snippet } =
		$props();
</script>

<div class={['dialog-content__header', className].filter(Boolean).join(' ')}>
	{@render children?.()}
</div>

<style lang="scss">
	// @use '$lib/styles/tokens' as *;
	.dialog-content__header {
		flex-direction: column;
	}
</style>
