<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/cn';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		ref = $bindable(null),
		sideOffset = 6,
		children,
		...rest
	}: SelectPrimitive.ContentProps & { class?: string; children?: Snippet } = $props();
</script>

<SelectPrimitive.Portal>
	<SelectPrimitive.Content
		bind:ref
		{sideOffset}
		class={cn(
			'relative z-50 max-h-[min(60vh,22rem)] min-w-[max(8rem,var(--bits-floating-anchor-width,8rem))] overflow-hidden rounded-xl border border-border/60 bg-popover text-popover-foreground shadow-lg',
			'data-[state=open]:animate-in data-[state=closed]:animate-out',
			'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
			'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
			'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
			className
		)}
		{...rest}
	>
		<SelectPrimitive.Viewport class="max-h-[inherit] overflow-y-auto p-1">
			{@render children?.()}
		</SelectPrimitive.Viewport>
	</SelectPrimitive.Content>
</SelectPrimitive.Portal>
