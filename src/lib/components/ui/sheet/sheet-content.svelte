<script lang="ts">
	import { Dialog as DialogPrimitive, type WithoutChildrenOrChild } from 'bits-ui';

	type Side = 'top' | 'bottom' | 'left' | 'right';

	let {
		class: className = '',
		ref = $bindable(null),
		side = 'right' as Side,
		showClose = true,
		children,
		...rest
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		side?: Side;
		showClose?: boolean;
		children?: import('svelte').Snippet;
	} = $props();

	const sideModifier: Record<Side, string> = {
		right: '',
		bottom: 'dialog-sheet--bottom',
		top: 'dialog-sheet--top',
		left: 'dialog-sheet--left'
	};

	const classes = $derived(
		['dialog-sheet', sideModifier[side], className].filter(Boolean).join(' ')
	);
</script>

<DialogPrimitive.Portal>
	<DialogPrimitive.Overlay class="dialog-overlay" />
	<DialogPrimitive.Content bind:ref class={classes} {...rest}>
		{@render children?.()}
		{#if showClose}
			<DialogPrimitive.Close class="dialog-sheet__close" aria-label="Close">
				<i class="ri-close-line" aria-hidden="true"></i>
			</DialogPrimitive.Close>
		{/if}
	</DialogPrimitive.Content>
</DialogPrimitive.Portal>
