<script lang="ts">
	import { Popover as PopoverPrimitive } from 'bits-ui';

	let {
		class: className = '',
		ref = $bindable(null),
		sideOffset = 6,
		align = 'center',
		children,
		...rest
	}: PopoverPrimitive.ContentProps = $props();
</script>

<PopoverPrimitive.Portal>
	<PopoverPrimitive.Content
		bind:ref
		{sideOffset}
		{align}
		class={['popover__content', className].filter(Boolean).join(' ')}
		{...rest}
	>
		{@render children?.()}
	</PopoverPrimitive.Content>
</PopoverPrimitive.Portal>
