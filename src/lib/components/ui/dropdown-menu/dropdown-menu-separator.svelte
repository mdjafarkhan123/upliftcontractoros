<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: DropdownMenuPrimitive.SeparatorProps = $props();
</script>

<DropdownMenuPrimitive.Separator
	bind:ref
	class={cn('-mx-1 my-1 h-px bg-border', className)}
	{...rest}
/>
