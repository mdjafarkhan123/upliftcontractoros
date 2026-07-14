<script lang="ts">
	import { SUGGESTED_CONTACT_TAGS, formatTagLabel, isDestructiveTag } from '$lib/contacts/tags';
	import { Button } from '$lib/components/ui/button';

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

<div class="contact-tag-editor">
	<!-- Suggested tags -->
	<div class="contact-tag-editor__group" role="group" aria-label="Suggested tags">
		{#each SUGGESTED_CONTACT_TAGS as tag (tag)}
			{@const active = selectedSet.has(tag)}
			{@const destructive = isDestructiveTag(tag)}
			<button
				type="button"
				onclick={() => toggle(tag)}
				aria-pressed={active}
				class="contact-tag-editor__chip
					{active ? 'contact-tag-editor__chip--active' : ''}
					{destructive ? 'contact-tag-editor__chip--danger' : ''}"
			>
				{formatTagLabel(tag)}
			</button>
		{/each}
	</div>

	<!-- Custom tags -->
	{#if customTags.length > 0}
		<div class="contact-tag-editor__group" aria-label="Custom tags">
			{#each customTags as tag (tag)}
				<span class="contact-tag-editor__custom-chip">
					{formatTagLabel(tag)}
					<button
						type="button"
						class="contact-tag-editor__custom-remove"
						aria-label={`Remove ${tag}`}
						onclick={() => toggle(tag)}
					>
						<i class="ri-close-line" aria-hidden="true"></i>
					</button>
				</span>
			{/each}
		</div>
	{/if}

	<!-- Add custom tag -->
	<div class="contact-tag-editor__custom-row">
		<div class="contact-tag-editor__custom-wrap">
			<div class="field">
				<input
					type="text"
					class="field__input"
					placeholder="Add custom tag (e.g. roof-2026)"
					bind:value={customDraft}
					onkeydown={onCustomKeydown}
					maxlength={MAX_TAG_LEN}
					aria-invalid={customError ? 'true' : undefined}
				/>
				{#if customError}
					<p class="field__error">{customError}</p>
				{/if}
			</div>
		</div>
		<Button type="button" variant="secondary" onclick={addCustom}>
			<i class="ri-add-line" aria-hidden="true"></i> Add
		</Button>
	</div>

	<p class="contact-tag-editor__hint">
		Tags are descriptors. Lifecycle (Lead / Customer / Archived) lives in status above.
	</p>
</div>
