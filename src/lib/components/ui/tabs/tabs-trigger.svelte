<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';

	let {
		class: className = '',
		children,
		...rest
	}: TabsPrimitive.TriggerProps & { children?: import('svelte').Snippet } = $props();
</script>

<TabsPrimitive.Trigger class={['tabs__trigger', className].filter(Boolean).join(' ')} {...rest}>
	{@render children?.()}
</TabsPrimitive.Trigger>
