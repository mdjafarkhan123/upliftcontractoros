<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLSelectAttributes } from 'svelte/elements';

	let {
		class: className = '',
		value = $bindable<string | number | undefined>(undefined),
		leading,
		children,
		...rest
	}: Omit<HTMLSelectAttributes, 'class' | 'value'> & {
		class?: string;
		value?: string | number | undefined;
		leading?: Snippet;
		children: Snippet;
	} = $props();
</script>

<div class="native-select">
	{#if leading}
		<span class="native-select__leading">
			{@render leading()}
		</span>
	{/if}
	<select
		bind:value
		class="native-select__field {leading ? 'native-select__field--has-leading' : ''} {className}"
		{...rest}
	>
		{@render children()}
	</select>
	<span class="native-select__chevron" aria-hidden="true">
		<i class="ri-arrow-up-down-line"></i>
	</span>
</div>
