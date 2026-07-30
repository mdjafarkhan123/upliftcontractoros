<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		children,
		...rest
	}: TabsPrimitive.ListProps & { children?: Snippet } = $props();
</script>

<TabsPrimitive.List class={['tabs__list', className].filter(Boolean).join(' ')} {...rest}>
	<ul class="tabs__list-items" role="none">
		{@render children?.()}
	</ul>
</TabsPrimitive.List>
