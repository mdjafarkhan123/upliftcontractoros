<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		value,
		label,
		disabled = false,
		children,
		...rest
	}: SelectPrimitive.ItemProps & { class?: string; children?: Snippet } = $props();
</script>

<SelectPrimitive.Item
	{value}
	{label}
	{disabled}
	class={['ui-select__item', className].filter(Boolean).join(' ')}
	{...rest}
>
	<span style="display:flex;flex:1;align-items:center;gap:8px">
		{#if children}
			{@render children()}
		{:else}
			{label ?? value}
		{/if}
	</span>
	<i class="ri-check-line ui-select__item-check" aria-hidden="true"></i>
</SelectPrimitive.Item>
