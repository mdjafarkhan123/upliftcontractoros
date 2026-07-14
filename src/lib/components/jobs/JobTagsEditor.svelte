<script lang="ts">
	import { SUGGESTED_JOB_TAGS, formatJobTagLabel } from '$lib/jobs/jobMeta';
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
	const customTags = $derived(value.filter((t) => !SUGGESTED_JOB_TAGS.includes(t as never)));

	function normalize(raw: string): string {
		return raw.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
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
		if (!tag) { customError = 'Enter a tag'; return; }
		if (tag.length > MAX_TAG_LEN) { customError = `Tag too long (max ${MAX_TAG_LEN} chars).`; return; }
		if (selectedSet.has(tag)) { customDraft = ''; return; }
		if (value.length >= MAX_TAGS) { customError = `Limit ${MAX_TAGS} tags.`; return; }
		value = [...value, tag];
		customDraft = '';
	}

	function onCustomKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
	}
</script>

<div class="job-tags-editor">
	<div class="job-tags-editor__suggested" role="group" aria-label="Suggested job tags">
		{#each SUGGESTED_JOB_TAGS as tag (tag)}
			<button
				type="button"
				onclick={() => toggle(tag)}
				aria-pressed={selectedSet.has(tag)}
				class="job-type-chip"
				class:job-type-chip--active={selectedSet.has(tag)}
			>
				{formatJobTagLabel(tag)}
			</button>
		{/each}
	</div>

	{#if customTags.length > 0}
		<div class="job-tags-editor__custom" aria-label="Custom job tags">
			{#each customTags as tag (tag)}
				<span class="job-tags-editor__custom-tag">
					{formatJobTagLabel(tag)}
					<button
						type="button"
						class="job-tags-editor__remove"
						aria-label="Remove {tag}"
						onclick={() => toggle(tag)}
					>
						<i class="ri-close-line" aria-hidden="true"></i>
					</button>
				</span>
			{/each}
		</div>
	{/if}

	<div class="job-tags-editor__add">
		<div class="job-tags-editor__input-wrap">
			<input
				class="field__input"
				placeholder="Add custom tag (e.g. gate-code)"
				bind:value={customDraft}
				onkeydown={onCustomKeydown}
				maxlength={MAX_TAG_LEN}
				aria-invalid={customError ? 'true' : undefined}
			/>
			{#if customError}
				<p class="field__error">{customError}</p>
			{/if}
		</div>
		<Button variant="outline" onclick={addCustom}>
			<i class="ri-add-line" aria-hidden="true"></i> Add
		</Button>
	</div>
</div>
