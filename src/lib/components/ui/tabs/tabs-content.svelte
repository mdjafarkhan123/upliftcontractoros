<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	let {
		class: className = '',
		children,
		...rest
	}: TabsPrimitive.ContentProps & { children?: import('svelte').Snippet } = $props();
</script>

<TabsPrimitive.Content
	class={cn(
		'mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
		className
	)}
	{...rest}
>
	{@render children?.()}
</TabsPrimitive.Content>
