<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';

	let {
		class: className = '',
		children,
		...rest
	}: TabsPrimitive.ListProps & { children?: import('svelte').Snippet } = $props();
</script>

<TabsPrimitive.List
	class={['tabs__list', className].filter(Boolean).join(' ')}
	{...rest}
>
	{@render children?.()}
</TabsPrimitive.List>
