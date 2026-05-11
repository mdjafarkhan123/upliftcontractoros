<script lang="ts">
	import { Dialog as DialogPrimitive, type WithoutChildrenOrChild } from 'bits-ui';
	import { X } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';

	type Side = 'top' | 'bottom' | 'left' | 'right';

	let {
		class: className,
		ref = $bindable(null),
		side = 'bottom' as Side,
		showClose = true,
		children,
		...rest
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		side?: Side;
		showClose?: boolean;
		children?: import('svelte').Snippet;
	} = $props();

	const sideClasses: Record<Side, string> = {
		bottom:
			'inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom pb-[max(env(safe-area-inset-bottom),1rem)]',
		top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
		left: 'inset-y-0 left-0 h-full w-[300px] border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
		right:
			'inset-y-0 right-0 h-full w-[300px] border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right'
	};
</script>

<DialogPrimitive.Portal>
	<DialogPrimitive.Overlay
		class="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
	/>
	<DialogPrimitive.Content
		bind:ref
		class={cn(
			'fixed z-50 flex flex-col gap-4 bg-background p-6 shadow-lg transition-transform ease-in-out data-[state=closed]:duration-200 data-[state=open]:duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out',
			sideClasses[side],
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
