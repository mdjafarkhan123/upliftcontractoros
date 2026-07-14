<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';

	let { class: className = '', ref = $bindable(null), ...rest }: DialogPrimitive.OverlayProps =
		$props();
</script>

<DialogPrimitive.Overlay
	bind:ref
	class={['dialog-overlay', className].filter(Boolean).join(' ')}
	{...rest}
/>
