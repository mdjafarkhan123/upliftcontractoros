<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';

	let {
		value = $bindable<string>(''),
		class: className = '',
		children,
		...rest
	}: TabsPrimitive.RootProps & { children?: import('svelte').Snippet } = $props();
</script>

<TabsPrimitive.Root bind:value class={className} {...rest}>
	{@render children?.()}
</TabsPrimitive.Root>
