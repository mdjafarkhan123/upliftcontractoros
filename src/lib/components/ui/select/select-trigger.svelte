<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		ref = $bindable(null),
		children,
		...rest
	}: SelectPrimitive.TriggerProps & { class?: string; children?: Snippet } = $props();
</script>

<SelectPrimitive.Trigger
	bind:ref
	class={['ui-select__trigger', className].filter(Boolean).join(' ')}
	{...rest}
>
	{@render children?.()}
	<i class="ri-expand-up-down-line" aria-hidden="true"></i>
</SelectPrimitive.Trigger>
