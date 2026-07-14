<script lang="ts">
	let { class: className = '', children }: { class?: string; children?: import('svelte').Snippet } =
		$props();
</script>

<div class={['card__body', className].filter(Boolean).join(' ')}>
	{@render children?.()}
</div>
