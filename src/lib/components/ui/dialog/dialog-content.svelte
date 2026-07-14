<script lang="ts">
	import { Dialog as DialogPrimitive, type WithoutChildrenOrChild } from 'bits-ui';
	import DialogOverlay from './dialog-overlay.svelte';

	let {
		class: className = '',
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
		class={['dialog-content', className].filter(Boolean).join(' ')}
		{...rest}
	>
		{@render children?.()}
		{#if showClose}
			<DialogPrimitive.Close class="dialog-content__close" aria-label="Close">
				<i class="ri-close-line" aria-hidden="true"></i>
			</DialogPrimitive.Close>
		{/if}
	</DialogPrimitive.Content>
</DialogPrimitive.Portal>
