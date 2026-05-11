<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	let {
		class: className,
		ref = $bindable(null),
		sideOffset = 4,
		children,
		...rest
	}: DropdownMenuPrimitive.ContentProps = $props();
</script>

<DropdownMenuPrimitive.Portal>
	<DropdownMenuPrimitive.Content
		bind:ref
		{sideOffset}
		class={cn(
			'z-50 min-w-[12rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
			className
		)}
		{...rest}
	>
		{@render children?.()}
	</DropdownMenuPrimitive.Content>
</DropdownMenuPrimitive.Portal>
