<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	let {
		class: className,
		ref = $bindable(null),
		children,
		...rest
	}: DialogPrimitive.DescriptionProps = $props();
</script>

<DialogPrimitive.Description
	bind:ref
	class={cn('text-sm text-muted-foreground', className)}
	{...rest}
>
	{@render children?.()}
</DialogPrimitive.Description>
