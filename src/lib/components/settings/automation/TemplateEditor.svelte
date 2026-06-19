<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import { previewTemplate, VAR_LABELS } from '$lib/automation/cardDefinitions';
	import { cn } from '$lib/utils/cn';
	import { Eye } from '@lucide/svelte';

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

<div class="flex flex-col gap-2">
	<div class="flex items-center justify-between gap-2">
		<Label for={id} class="text-xs font-medium">
			{label}
			{#if required}<span class="text-destructive">*</span>{/if}
		</Label>
		<span class="text-[11px] tabular-nums text-muted-foreground/70">{(value ?? '').length}/{maxlength}</span>
	</div>

	{#if allowedVars.length > 0}
		<div class="flex flex-wrap gap-1.5">
			{#each allowedVars as v (v)}
				<button
					type="button"
					onclick={() => insertVar(v)}
					class="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
				>
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
			class={cn(
				'flex min-h-[88px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background transition-shadow placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
				error && 'border-destructive'
			)}
		></textarea>
	{:else}
		<input
			{id}
			bind:value
			bind:this={el}
			{maxlength}
			class={cn(
				'flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm ring-offset-background transition-all placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-card-raised/70 dark:shadow-card',
				error && 'border-destructive'
			)}
		/>
	{/if}

	{#if (value ?? '').trim().length > 0}
		<div class="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2">
			<Eye class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
			<p class="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{preview}</p>
		</div>
	{/if}

	{#if error}
		<p class="text-xs text-destructive">{error}</p>
	{:else if hint}
		<p class="text-[11px] text-muted-foreground/70">{hint}</p>
	{/if}
</div>
