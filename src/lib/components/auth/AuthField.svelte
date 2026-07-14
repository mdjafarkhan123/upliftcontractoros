<script lang="ts">
	let {
		id,
		label,
		value = '',
		type = 'text',
		placeholder = '',
		autocomplete,
		required = false,
		minlength,
		trailing,
		class: className = ''
	}: {
		id: string;
		label: string;
		value?: string;
		type?: string;
		placeholder?: string;
		autocomplete?: import('svelte/elements').HTMLInputAttributes['autocomplete'];
		required?: boolean;
		minlength?: number;
		trailing?: import('svelte').Snippet;
		class?: string;
	} = $props();
</script>

<div class="field {className}">
	<div class="auth-field__label-row">
		<label for={id} class="field__label" class:field__label--required={required}>
			{label}
		</label>
		{#if trailing}{@render trailing()}{/if}
	</div>
	<input
		{id}
		name={id}
		{type}
		{value}
		{placeholder}
		{autocomplete}
		{required}
		{minlength}
		class="field__input"
	/>
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.auth-field__label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: $space-2;
	}
</style>
