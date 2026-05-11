<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	let {
		class: className,
		ref = $bindable(null),
		children,
		...rest
	}: DropdownMenuPrimitive.GroupHeadingProps = $props();
</script>

<DropdownMenuPrimitive.GroupHeading
	bind:ref
	class={cn('px-3 py-2 text-xs font-medium text-muted-foreground', className)}
	{...rest}
>
	{@render children?.()}
</DropdownMenuPrimitive.GroupHeading>
