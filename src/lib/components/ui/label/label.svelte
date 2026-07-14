<script lang="ts">
	import type { HTMLLabelAttributes } from 'svelte/elements';

	let {
		class: className = '',
		children,
		...rest
	}: HTMLLabelAttributes & { class?: string; children?: import('svelte').Snippet } = $props();
</script>

<label class={['ui-label', className].filter(Boolean).join(' ')} {...rest}>
	{@render children?.()}
</label>
