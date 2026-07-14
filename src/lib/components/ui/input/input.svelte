<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		class: className = '',
		value = $bindable<string | number | undefined>(undefined),
		...rest
	}: Omit<HTMLInputAttributes, 'class' | 'value'> & {
		class?: string;
		value?: string | number | undefined;
	} = $props();
</script>

<input
	bind:value
	class={['field__input', className].filter(Boolean).join(' ')}
	{...rest}
/>
