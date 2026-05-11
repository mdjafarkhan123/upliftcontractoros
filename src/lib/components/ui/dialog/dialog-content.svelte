<script lang="ts">
	import { Dialog as DialogPrimitive, type WithoutChildrenOrChild } from 'bits-ui';
	import { X } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';
	import DialogOverlay from './dialog-overlay.svelte';

	let {
		class: className,
		ref = $bindable(null),
		children,
		showClose = true,
		...rest
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		children?: import('svelte').Snippet;
		showClose?: boolean;
	} = $props();
</script>

<DialogPrimitive.Portal>
	<DialogOverlay />
	<DialogPrimitive.Content
		bind:ref
		class={cn(
			'fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
			className
		)}
		{...rest}
	>
		{@render children?.()}
		{#if showClose}
			<DialogPrimitive.Close
				class="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label="Close"
			>
				<X class="h-5 w-5" />
			</DialogPrimitive.Close>
		{/if}
	</DialogPrimitive.Content>
</DialogPrimitive.Portal>
