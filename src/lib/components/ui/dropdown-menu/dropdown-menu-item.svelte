<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';

	let {
		class: className = '',
		ref = $bindable(null),
		variant = 'default' as 'default' | 'destructive',
		children,
		...rest
	}: DropdownMenuPrimitive.ItemProps & { variant?: 'default' | 'destructive' } = $props();

	const classes = $derived(
		['dropdown__item', variant === 'destructive' && 'dropdown__item--destructive', className]
			.filter(Boolean)
			.join(' ')
	);
</script>

<DropdownMenuPrimitive.Item bind:ref class={classes} {...rest}>
	{@render children?.()}
</DropdownMenuPrimitive.Item>
