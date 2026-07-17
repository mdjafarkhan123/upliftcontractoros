<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let {
		class: className = '',
		value = $bindable<string>(''),
		...rest
	}: Omit<HTMLTextareaAttributes, 'class' | 'value'> & {
		class?: string;
		value?: string;
	} = $props();
</script>

<textarea bind:value class={['field__textarea', className].filter(Boolean).join(' ')} {...rest}
></textarea>
