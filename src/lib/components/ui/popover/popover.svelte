<script lang="ts">
	import { Popover as PopoverPrimitive } from 'bits-ui';

	let { open = $bindable(false), children, ...rest }: PopoverPrimitive.RootProps = $props();
</script>

<PopoverPrimitive.Root bind:open {...rest}>
	{@render children?.()}
</PopoverPrimitive.Root>

<style lang="scss">
	.popover__content {
		width: unset;
	}
</style>
