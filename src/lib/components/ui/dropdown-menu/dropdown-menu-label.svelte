<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';

	let {
		class: className = '',
		ref = $bindable(null),
		children,
		...rest
	}: DropdownMenuPrimitive.GroupHeadingProps = $props();
</script>

<DropdownMenuPrimitive.GroupHeading
	bind:ref
	class={['dropdown__label', className].filter(Boolean).join(' ')}
	{...rest}
>
	{@render children?.()}
</DropdownMenuPrimitive.GroupHeading>
