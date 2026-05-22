<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	let {
		class: className = '',
		children,
		...rest
	}: TabsPrimitive.TriggerProps & { children?: import('svelte').Snippet } = $props();
</script>

<TabsPrimitive.Trigger
	class={cn(
		'inline-flex min-h-[36px] flex-1 items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ring-offset-background transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-card data-[state=active]:ring-1 data-[state=active]:ring-border/70 dark:data-[state=active]:bg-primary/20 dark:data-[state=active]:text-[hsl(var(--brand-light))] dark:data-[state=active]:ring-primary/25',
		className
	)}
	{...rest}
>
	{@render children?.()}
</TabsPrimitive.Trigger>
