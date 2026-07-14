<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import { previewTemplate, VAR_LABELS } from '$lib/automation/cardDefinitions';

	let {
		id,
		label,
		value = $bindable(''),
		allowedVars,
		multiline = true,
		rows = 3,
		maxlength = 1000,
		required = true,
		error,
		hint
	}: {
		id: string;
		label: string;
		value?: string;
		allowedVars: string[];
		multiline?: boolean;
		rows?: number;
		maxlength?: number;
		required?: boolean;
		error?: string;
		hint?: string;
	} = $props();

	let el = $state<HTMLTextAreaElement | HTMLInputElement | null>(null);

	function insertVar(name: string) {
		const token = `{${name}}`;
		const node = el;
		if (!node) {
			value = `${value}${token}`;
			return;
		}
		const start = node.selectionStart ?? value.length;
		const end = node.selectionEnd ?? value.length;
		value = value.slice(0, start) + token + value.slice(end);
		// Restore caret just after the inserted token on the next tick.
		queueMicrotask(() => {
			node.focus();
			const pos = start + token.length;
			node.setSelectionRange(pos, pos);
		});
	}

	let preview = $derived(previewTemplate(value ?? ''));
</script>

<div class="tpl-field">
	<div class="tpl-field__top">
		<Label for={id} class="field__label">
			{label}
			{#if required}<span class="tpl-field__req">*</span>{/if}
		</Label>
		<span class="tpl-field__count">{(value ?? '').length}/{maxlength}</span>
	</div>

	{#if allowedVars.length > 0}
		<div class="tpl-field__vars">
			{#each allowedVars as v (v)}
				<button type="button" onclick={() => insertVar(v)} class="tpl-field__var">
					+ {VAR_LABELS[v] ?? v}
				</button>
			{/each}
		</div>
	{/if}

	{#if multiline}
		<textarea
			{id}
			bind:value
			bind:this={el}
			{maxlength}
			{rows}
			class="field__textarea"
			class:field__textarea--error={error}
		></textarea>
	{:else}
		<input
			{id}
			bind:value
			bind:this={el}
			{maxlength}
			class="field__input"
			class:field__input--error={error}
		/>
	{/if}

	{#if (value ?? '').trim().length > 0}
		<div class="tpl-field__preview">
			<i class="ri-eye-line tpl-field__preview-icon" aria-hidden="true"></i>
			<p class="tpl-field__preview-text">{preview}</p>
		</div>
	{/if}

	{#if error}
		<p class="field__error">{error}</p>
	{:else if hint}
		<p class="field__hint">{hint}</p>
	{/if}
</div>
