<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	let {
		class: className,
		ref = $bindable(null),
		children,
		...rest
	}: DialogPrimitive.TitleProps = $props();
</script>

<DialogPrimitive.Title
	bind:ref
	class={cn('text-lg font-semibold leading-tight tracking-tight', className)}
	{...rest}
>
	{@render children?.()}
</DialogPrimitive.Title>
