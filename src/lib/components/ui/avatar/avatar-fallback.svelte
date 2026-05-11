<script lang="ts">
	import { Avatar as AvatarPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	let {
		class: className,
		ref = $bindable(null),
		children,
		...rest
	}: AvatarPrimitive.FallbackProps = $props();
</script>

<AvatarPrimitive.Fallback
	bind:ref
	class={cn(
		'flex h-full w-full items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground',
		className
	)}
	{...rest}
>
	{@render children?.()}
</AvatarPrimitive.Fallback>
