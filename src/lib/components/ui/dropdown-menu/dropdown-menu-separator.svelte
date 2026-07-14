<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';

	let {
		class: className = '',
		ref = $bindable(null),
		...rest
	}: DropdownMenuPrimitive.SeparatorProps = $props();
</script>

<DropdownMenuPrimitive.Separator
	bind:ref
	class={['dropdown__sep', className].filter(Boolean).join(' ')}
	{...rest}
/>
