<script lang="ts">
	let { class: className = '', children }: { class?: string; children?: import('svelte').Snippet } =
		$props();
</script>

<h3 class={['card__title', className].filter(Boolean).join(' ')}>
	{@render children?.()}
</h3>
