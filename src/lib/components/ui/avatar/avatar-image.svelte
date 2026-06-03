<script lang="ts">
	import { Avatar as AvatarPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	let { class: className, ref = $bindable(null), ...rest }: AvatarPrimitive.ImageProps = $props();
</script>

<AvatarPrimitive.Image
	bind:ref
	class={cn('aspect-square h-full w-full object-cover', className)}
	{...rest}
/>
