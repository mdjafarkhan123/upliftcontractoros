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
		'inline-flex h-11 w-full items-center justify-start gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted/70 p-1 text-muted-foreground shadow-card dark:border-white/10 dark:bg-card-raised/70',
		className
	)}
	{...rest}
>
	{@render children?.()}
</TabsPrimitive.List>
