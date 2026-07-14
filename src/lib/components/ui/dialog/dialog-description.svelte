<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';

	let {
		class: className = '',
		ref = $bindable(null),
		children,
		...rest
	}: DialogPrimitive.DescriptionProps = $props();
</script>

<DialogPrimitive.Description
	bind:ref
	class={['dialog-content__description', className].filter(Boolean).join(' ')}
	{...rest}
>
	{@render children?.()}
</DialogPrimitive.Description>
