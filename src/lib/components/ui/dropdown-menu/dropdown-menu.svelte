<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';

	let { children, ...rest }: DropdownMenuPrimitive.RootProps = $props();
</script>

<DropdownMenuPrimitive.Root {...rest}>
	{@render children?.()}
</DropdownMenuPrimitive.Root>
