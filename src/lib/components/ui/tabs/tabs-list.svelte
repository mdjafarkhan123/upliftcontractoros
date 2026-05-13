<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	let {
		class: className = '',
		children,
		...rest
	}: TabsPrimitive.ListProps & { children?: import('svelte').Snippet } = $props();
</script>

<TabsPrimitive.List
	class={cn(
		'inline-flex h-11 w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground',
		className
	)}
	{...rest}
>
	{@render children?.()}
</TabsPrimitive.List>
