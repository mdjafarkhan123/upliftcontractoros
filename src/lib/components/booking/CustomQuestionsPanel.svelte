<script lang="ts">
	// R5.2b — the "Custom questions" section of the form builder's Add Questions
	// tab. Lists a request form's contractor-added questions, adds new ones from
	// the type grid, and edits/deletes them via an inline editor card. All writes
	// go through /api/booking-links/[id]/fields/custom and return the fresh list
	// (server-authoritative write-through), which the parent patches into preview.
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';
	import {
		CUSTOM_QUESTION_TYPES,
		CUSTOM_QUESTION_TYPE_META,
		customTypeHasOptions,
		type BuilderCustomField,
		type CustomQuestionType
	} from '$lib/types/bookingForms';

	type Props = {
		linkId: string;
		fields: BuilderCustomField[];
		onChange: (fields: BuilderCustomField[]) => void;
	};

	let { linkId, fields, onChange }: Props = $props();

	// Draft being added (id===null) or edited (id===existing). Null ⇒ editor closed.
	type Draft = {
		id: string | null;
		type: CustomQuestionType;
		label: string;
		help_text: string;
		placeholder: string;
		options: string[];
		required: boolean;
	};
	let draft = $state<Draft | null>(null);
	let saving = $state(false);
	let deletingId = $state<string | null>(null);
	let fieldErrors = $state<Record<string, string>>({});

	const hasOptions = $derived(draft ? customTypeHasOptions(draft.type) : false);

	function startAdd(type: CustomQuestionType) {
		fieldErrors = {};
		draft = {
			id: null,
			type,
			label: '',
			help_text: '',
			placeholder: '',
			options: customTypeHasOptions(type) ? ['', ''] : [],
			required: false
		};
	}

	function startEdit(f: BuilderCustomField) {
		fieldErrors = {};
		draft = {
			id: f.id,
			type: f.type,
			label: f.label,
			help_text: f.help_text ?? '',
			placeholder: f.placeholder ?? '',
			options: f.options.length > 0 ? [...f.options] : customTypeHasOptions(f.type) ? ['', ''] : [],
			required: f.required
		};
	}

	function cancelDraft() {
		draft = null;
		fieldErrors = {};
	}

	function addOption() {
		if (draft) draft.options = [...draft.options, ''];
	}

	function removeOption(i: number) {
		if (draft) draft.options = draft.options.filter((_, idx) => idx !== i);
	}

	async function saveDraft() {
		if (!draft || saving) return;
		fieldErrors = {};
		const payload = {
			type: draft.type,
			label: draft.label.trim(),
			help_text: draft.help_text.trim() || null,
			placeholder: draft.placeholder.trim() || null,
			options: hasOptions ? draft.options.map((o) => o.trim()).filter(Boolean) : [],
			is_required: draft.required
		};

		// Client-side guard mirroring the server rules for instant feedback.
		if (!payload.label) {
			fieldErrors = { label: 'Question label is required' };
			return;
		}
		if (hasOptions && payload.options.length < 1) {
			fieldErrors = { options: 'Add at least one option.' };
			return;
		}

		const isEdit = draft.id !== null;
		saving = true;
		try {
			const url = draft.id
				? `/api/booking-links/${linkId}/fields/custom/${draft.id}`
				: `/api/booking-links/${linkId}/fields/custom`;
			const res = await fetch(url, {
				method: draft.id ? 'PATCH' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				if (body.field_errors) fieldErrors = body.field_errors;
				toast.error(body.error ?? 'Could not save the question.');
				return;
			}
			if (body.data?.custom_fields) onChange(body.data.custom_fields);
			draft = null;
			toast.success(isEdit ? 'Question saved' : 'Question added');
		} catch {
			toast.error('Could not save the question.');
		} finally {
			saving = false;
		}
	}

	async function deleteQuestion(f: BuilderCustomField) {
		if (deletingId) return;
		deletingId = f.id;
		try {
			const res = await fetch(`/api/booking-links/${linkId}/fields/custom/${f.id}`, {
				method: 'DELETE'
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not delete the question.');
				return;
			}
			if (body.data?.custom_fields) onChange(body.data.custom_fields);
			if (draft?.id === f.id) draft = null;
		} catch {
			toast.error('Could not delete the question.');
		} finally {
			deletingId = null;
		}
	}
</script>

<div class="cq">
	<div class="cq__head">
		<h3 class="cq__title">Custom questions</h3>
		<p class="cq__sub">Add your own questions to this form.</p>
	</div>

	{#if fields.length > 0}
		<ul class="cq__list">
			{#each fields as f (f.id)}
				<li class="cq-item">
					<div class="cq-item__main">
						<i class="cq-item__icon {CUSTOM_QUESTION_TYPE_META[f.type]?.icon ?? 'ri-question-line'}" aria-hidden="true"></i>
						<div class="cq-item__text">
							<span class="cq-item__label">{f.label || 'Untitled question'}</span>
							<span class="cq-item__type">
								{CUSTOM_QUESTION_TYPE_META[f.type]?.label ?? f.type}{#if f.required}<span class="cq-item__req"> · Required</span>{/if}
							</span>
						</div>
					</div>
					<div class="cq-item__actions">
						<button type="button" class="cq-item__btn" onclick={() => startEdit(f)} aria-label="Edit question">
							<i class="ri-pencil-line" aria-hidden="true"></i>
						</button>
						<button
							type="button"
							class="cq-item__btn cq-item__btn--danger"
							onclick={() => deleteQuestion(f)}
							disabled={deletingId === f.id}
							aria-label="Delete question"
						>
							{#if deletingId === f.id}
								<i class="ri-loader-4-line animate-spin" aria-hidden="true"></i>
							{:else}
								<i class="ri-delete-bin-line" aria-hidden="true"></i>
							{/if}
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if draft}
		<!-- Inline editor card (add or edit) -->
		<div class="cq-editor">
			<div class="cq-editor__head">
				<i class="{CUSTOM_QUESTION_TYPE_META[draft.type]?.icon ?? 'ri-question-line'}" aria-hidden="true"></i>
				<span>{CUSTOM_QUESTION_TYPE_META[draft.type]?.label ?? draft.type}</span>
			</div>

			<div class="field">
				<Label for="cq-label" class="field__label field__label--required">Question</Label>
				<Input id="cq-label" bind:value={draft.label} maxlength={200} placeholder="e.g. What type of roof do you have?" />
				{#if fieldErrors.label}<p class="field__error">{fieldErrors.label}</p>{/if}
			</div>

			<div class="field">
				<Label for="cq-help" class="field__label">Help text (optional)</Label>
				<Input id="cq-help" bind:value={draft.help_text} maxlength={500} placeholder="Extra guidance shown under the question" />
			</div>

			{#if hasOptions}
				<div class="field">
					<span class="field__label field__label--required">Options</span>
					<div class="cq-options">
						{#each draft.options as _, i (i)}
							<div class="cq-options__row">
								<Input bind:value={draft.options[i]} maxlength={200} placeholder={`Option ${i + 1}`} />
								<button
									type="button"
									class="cq-options__remove"
									onclick={() => removeOption(i)}
									disabled={draft.options.length <= 1}
									aria-label="Remove option"
								>
									<i class="ri-close-line" aria-hidden="true"></i>
								</button>
							</div>
						{/each}
					</div>
					<button type="button" class="cq-options__add" onclick={addOption}>
						<i class="ri-add-line" aria-hidden="true"></i> Add option
					</button>
					{#if fieldErrors.options}<p class="field__error">{fieldErrors.options}</p>{/if}
				</div>
			{:else if draft.type === 'short_text' || draft.type === 'long_text' || draft.type === 'number'}
				<div class="field">
					<Label for="cq-ph" class="field__label">Placeholder (optional)</Label>
					<Input id="cq-ph" bind:value={draft.placeholder} maxlength={200} />
				</div>
			{/if}

			<div class="settings-toggle">
				<div class="settings-toggle__text">
					<span class="settings-toggle__label">Required</span>
					<p class="settings-toggle__desc">Clients must answer this question to submit.</p>
				</div>
				<Switch bind:checked={draft.required} />
			</div>

			<div class="cq-editor__actions">
				<Button variant="ghost" onclick={cancelDraft} disabled={saving}>Cancel</Button>
				<Button onclick={saveDraft} loading={saving} loadingLabel="Saving…">
					{draft.id ? 'Save question' : 'Add question'}
				</Button>
			</div>
		</div>
	{:else}
		<!-- Type grid — Jobber "Select the type of question you'd like to ask" -->
		<p class="cq__pick">Select the type of question you&rsquo;d like to ask</p>
		<div class="cq-types">
			{#each CUSTOM_QUESTION_TYPES as t (t.type)}
				<button type="button" class="cq-type" onclick={() => startAdd(t.type)}>
					<i class="cq-type__icon {t.icon}" aria-hidden="true"></i>
					<span class="cq-type__label">{t.label}</span>
				</button>
			{/each}
			<div class="cq-type cq-type--soon" aria-disabled="true">
				<i class="cq-type__icon ri-crop-line" aria-hidden="true"></i>
				<span class="cq-type__label">Area</span>
				<span class="cq-type__soon">Soon</span>
			</div>
		</div>
	{/if}
</div>
