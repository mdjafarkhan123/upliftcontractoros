<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		children,
		...rest
	}: TabsPrimitive.TriggerProps & { children?: Snippet } = $props();
</script>

<li class="tabs__list-item">
	<TabsPrimitive.Trigger class={['tabs__trigger', className].filter(Boolean).join(' ')} {...rest}>
		{@render children?.()}
	</TabsPrimitive.Trigger>
</li>
