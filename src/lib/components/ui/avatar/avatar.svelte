<script lang="ts">
	import { Avatar as AvatarPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	let {
		class: className,
		ref = $bindable(null),
		children,
		...rest
	}: AvatarPrimitive.RootProps = $props();
</script>

<AvatarPrimitive.Root
	bind:ref
	class={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)}
	{...rest}
>
	{@render children?.()}
</AvatarPrimitive.Root>
