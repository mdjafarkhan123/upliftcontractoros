<script lang="ts">
	let { class: className = '', children }: { class?: string; children?: import('svelte').Snippet } =
		$props();
</script>

<p class={['ui-alert__description', className].filter(Boolean).join(' ')}>
	{@render children?.()}
</p>
