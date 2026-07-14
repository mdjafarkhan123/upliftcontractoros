<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';

	let {
		class: className = '',
		ref = $bindable(null),
		children,
		...rest
	}: DialogPrimitive.TitleProps = $props();
</script>

<DialogPrimitive.Title
	bind:ref
	class={['dialog-sheet__title', className].filter(Boolean).join(' ')}
	{...rest}
>
	{@render children?.()}
</DialogPrimitive.Title>
