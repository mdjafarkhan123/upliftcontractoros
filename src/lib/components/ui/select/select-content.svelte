<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
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
		class={['ui-select__content', className].filter(Boolean).join(' ')}
		{...rest}
	>
		<SelectPrimitive.Viewport class="ui-select__viewport">
			{@render children?.()}
		</SelectPrimitive.Viewport>
	</SelectPrimitive.Content>
</SelectPrimitive.Portal>
