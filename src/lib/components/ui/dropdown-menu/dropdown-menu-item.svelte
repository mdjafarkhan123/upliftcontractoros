<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	let {
		class: className,
		ref = $bindable(null),
		variant = 'default' as 'default' | 'destructive',
		children,
		...rest
	}: DropdownMenuPrimitive.ItemProps & { variant?: 'default' | 'destructive' } = $props();
</script>

<DropdownMenuPrimitive.Item
	bind:ref
	class={cn(
		'relative flex min-h-[44px] cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none transition-all duration-150 ease-out focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
		variant === 'destructive' && 'text-destructive focus:bg-destructive/10 focus:text-destructive',
		className
	)}
	{...rest}
>
	{@render children?.()}
</DropdownMenuPrimitive.Item>
