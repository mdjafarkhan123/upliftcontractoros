<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';

	let {
		class: className = '',
		children,
		...rest
	}: TabsPrimitive.ContentProps & { children?: import('svelte').Snippet } = $props();
</script>

<TabsPrimitive.Content class={['tabs__content', className].filter(Boolean).join(' ')} {...rest}>
	{@render children?.()}
</TabsPrimitive.Content>
