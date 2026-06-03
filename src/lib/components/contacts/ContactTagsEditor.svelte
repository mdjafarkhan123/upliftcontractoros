<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { SUGGESTED_CONTACT_TAGS, formatTagLabel, isDestructiveTag } from '$lib/contacts/tags';
	import { X, Plus } from '@lucide/svelte';

	let {
		value = $bindable<string[]>([])
	}: {
		value?: string[];
	} = $props();

	const MAX_TAGS = 20;
	const MAX_TAG_LEN = 50;

	let customDraft = $state('');
	let customError = $state<string | null>(null);

	const selectedSet = $derived(new Set(value));
	const customTags = $derived(value.filter((t) => !SUGGESTED_CONTACT_TAGS.includes(t as never)));

	function normalize(raw: string): string {
		return raw
			.trim()
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '');
	}

	function toggle(tag: string) {
		if (selectedSet.has(tag)) {
			value = value.filter((t) => t !== tag);
		} else {
			if (value.length >= MAX_TAGS) return;
			value = [...value, tag];
		}
	}

	function addCustom() {
		customError = null;
		const tag = normalize(customDraft);
		if (!tag) {
			customError = 'Enter a tag';
			return;
		}
		if (tag.length > MAX_TAG_LEN) {
			customError = `Tag too long (max ${MAX_TAG_LEN} chars).`;
			return;
		}
		if (selectedSet.has(tag)) {
			customDraft = '';
			return;
		}
		if (value.length >= MAX_TAGS) {
			customError = `Limit ${MAX_TAGS} tags.`;
			return;
		}
		value = [...value, tag];
		customDraft = '';
	}

	function onCustomKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			addCustom();
		}
	}
</script>

<div class="space-y-3">
	<div class="flex flex-wrap gap-1.5" role="group" aria-label="Suggested tags">
		{#each SUGGESTED_CONTACT_TAGS as tag (tag)}
			{@const active = selectedSet.has(tag)}
			{@const destructive = isDestructiveTag(tag)}
			<button
				type="button"
				onclick={() => toggle(tag)}
				aria-pressed={active}
				class={cn(
					'inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors',
					active
						? destructive
							? 'border-destructive bg-destructive text-destructive-foreground'
							: 'border-primary bg-primary text-primary-foreground'
						: destructive
							? 'border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10'
							: 'border-border bg-card text-muted-foreground hover:bg-accent/40 hover:text-foreground'
				)}
			>
				{formatTagLabel(tag)}
			</button>
		{/each}
	</div>

	{#if customTags.length > 0}
		<div class="flex flex-wrap gap-1.5" aria-label="Custom tags">
			{#each customTags as tag (tag)}
				<span
					class="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-muted/40 pl-3 pr-1 text-xs font-medium text-foreground"
				>
					{formatTagLabel(tag)}
					<button
						type="button"
						class="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
						aria-label={`Remove ${tag}`}
						onclick={() => toggle(tag)}
					>
						<X class="h-3 w-3" />
					</button>
				</span>
			{/each}
		</div>
	{/if}

	<div class="flex items-start gap-2">
		<div class="flex-1">
			<Input
				placeholder="Add custom tag (e.g. roof-2026)"
				bind:value={customDraft}
				onkeydown={onCustomKeydown}
				maxlength={MAX_TAG_LEN}
				aria-invalid={customError ? 'true' : undefined}
			/>
			{#if customError}
				<p class="mt-1 text-xs text-destructive">{customError}</p>
			{/if}
		</div>
		<Button type="button" variant="outline" class="h-11" onclick={addCustom}>
			<Plus class="h-4 w-4" /> Add
		</Button>
	</div>
	<p class="text-xs text-muted-foreground">
		Tags are descriptors. Lifecycle (Lead / Customer / Archived) lives in status above.
	</p>
</div>
