<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Select from '$lib/components/ui/select';
	import { toast } from '$lib/stores/toast.svelte';

	type FieldType =
		| 'section'
		| 'short_text'
		| 'long_text'
		| 'number'
		| 'checkbox'
		| 'dropdown'
		| 'date'
		| 'photo'
		| 'signature';

	type InitialField = {
		id: string;
		field_type: string;
		label: string;
		help_text: string | null;
		required: boolean;
		options: string[] | null;
	};

	let {
		templateId,
		initialName = '',
		initialDescription = '',
		initialFields = []
	}: {
		templateId?: string;
		initialName?: string;
		initialDescription?: string;
		initialFields?: InitialField[];
	} = $props();

	const FIELD_TYPES: { value: FieldType; label: string; icon: string }[] = [
		{ value: 'section', label: 'Section heading', icon: 'ri-heading' },
		{ value: 'short_text', label: 'Short text', icon: 'ri-text' },
		{ value: 'long_text', label: 'Paragraph', icon: 'ri-align-left' },
		{ value: 'number', label: 'Number', icon: 'ri-hashtag' },
		{ value: 'checkbox', label: 'Checkbox (Yes / No)', icon: 'ri-checkbox-line' },
		{ value: 'dropdown', label: 'Dropdown', icon: 'ri-list-check' },
		{ value: 'date', label: 'Date', icon: 'ri-calendar-line' },
		{ value: 'photo', label: 'Photo', icon: 'ri-camera-line' },
		{ value: 'signature', label: 'Signature', icon: 'ri-quill-pen-line' }
	];

	const typeMeta = (t: FieldType) => FIELD_TYPES.find((f) => f.value === t) ?? FIELD_TYPES[1];

	type BuilderField = {
		key: string;
		id?: string;
		field_type: FieldType;
		label: string;
		help_text: string;
		required: boolean;
		options: string[];
	};

	let name = $state(initialName);
	let description = $state(initialDescription);
	let fields = $state<BuilderField[]>(
		initialFields.map((f) => ({
			key: crypto.randomUUID(),
			id: f.id,
			field_type: f.field_type as FieldType,
			label: f.label,
			help_text: f.help_text ?? '',
			required: f.required,
			options: f.options ?? []
		}))
	);

	let saving = $state(false);
	let nameError = $state('');

	function addField() {
		fields = [
			...fields,
			{
				key: crypto.randomUUID(),
				field_type: 'short_text',
				label: '',
				help_text: '',
				required: false,
				options: []
			}
		];
	}

	function removeField(key: string) {
		fields = fields.filter((f) => f.key !== key);
	}

	function moveField(index: number, dir: -1 | 1) {
		const target = index + dir;
		if (target < 0 || target >= fields.length) return;
		const next = [...fields];
		[next[index], next[target]] = [next[target], next[index]];
		fields = next;
	}

	function setType(key: string, value: FieldType) {
		fields = fields.map((f) =>
			f.key === key
				? { ...f, field_type: value, options: value === 'dropdown' ? f.options : [] }
				: f
		);
	}

	function addOption(key: string) {
		fields = fields.map((f) => (f.key === key ? { ...f, options: [...f.options, ''] } : f));
	}

	function updateOption(key: string, idx: number, value: string) {
		fields = fields.map((f) =>
			f.key === key ? { ...f, options: f.options.map((o, i) => (i === idx ? value : o)) } : f
		);
	}

	function removeOption(key: string, idx: number) {
		fields = fields.map((f) =>
			f.key === key ? { ...f, options: f.options.filter((_, i) => i !== idx) } : f
		);
	}

	async function save() {
		if (saving) return;
		nameError = '';
		if (!name.trim()) {
			nameError = 'Name is required';
			return;
		}
		if (fields.length === 0) {
			toast.error('Add at least one field');
			return;
		}
		for (const f of fields) {
			if (!f.label.trim()) {
				toast.error('Every field needs a label');
				return;
			}
			if (f.field_type === 'dropdown' && f.options.filter((o) => o.trim()).length === 0) {
				toast.error(`"${f.label.trim()}" needs at least one dropdown option`);
				return;
			}
		}

		saving = true;
		try {
			const payload = {
				name: name.trim(),
				description: description.trim() || null,
				fields: fields.map((f, idx) => ({
					id: f.id,
					field_type: f.field_type,
					label: f.label.trim(),
					help_text: f.help_text.trim() || null,
					required: f.field_type === 'section' ? false : f.required,
					options:
						f.field_type === 'dropdown'
							? f.options.map((o) => o.trim()).filter((o) => o.length > 0)
							: null,
					position: idx
				}))
			};

			const url = templateId ? `/api/job-form-templates/${templateId}` : '/api/job-form-templates';
			const res = await fetch(url, {
				method: templateId ? 'PATCH' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as {
					error?: string;
					field_errors?: Record<string, string>;
				};
				if (body.field_errors?.name) nameError = body.field_errors.name;
				toast.error('Could not save form', { description: body.error });
				return;
			}

			toast.success(templateId ? 'Form saved' : 'Form created');
			await goto(resolve('/settings/job-forms'));
		} finally {
			saving = false;
		}
	}
</script>

<div class="form-builder">
	<div class="form-builder__meta">
		<div class="field">
			<label class="field__label" for="fb-name">Form name</label>
			<input
				id="fb-name"
				class="field__input"
				class:field__input--error={nameError}
				bind:value={name}
				placeholder="e.g. Furnace install checklist"
				maxlength={120}
			/>
			{#if nameError}<p class="field__error">{nameError}</p>{/if}
		</div>
		<div class="field">
			<label class="field__label" for="fb-desc">Description <span>(optional)</span></label>
			<textarea
				id="fb-desc"
				class="field__textarea"
				bind:value={description}
				rows={2}
				placeholder="What is this form for? Shown to your crew."
				maxlength={500}
			></textarea>
		</div>
	</div>

	<div class="form-builder__fields">
		{#each fields as f, index (f.key)}
			<div class="form-builder__field">
				<div class="form-builder__field-head">
					<Select.Root value={f.field_type} onValueChange={(v) => setType(f.key, v as FieldType)}>
						<Select.Trigger class="field__input form-builder__type">
							<i class={typeMeta(f.field_type).icon} aria-hidden="true"></i>
							<span>{typeMeta(f.field_type).label}</span>
						</Select.Trigger>
						<Select.Content>
							{#each FIELD_TYPES as t (t.value)}
								<Select.Item value={t.value} label={t.label}>
									<i class={t.icon} aria-hidden="true"></i>
									{t.label}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>

					<div class="form-builder__field-actions">
						<button
							type="button"
							class="form-builder__icon-btn"
							aria-label="Move up"
							disabled={index === 0}
							onclick={() => moveField(index, -1)}
						>
							<i class="ri-arrow-up-line" aria-hidden="true"></i>
						</button>
						<button
							type="button"
							class="form-builder__icon-btn"
							aria-label="Move down"
							disabled={index === fields.length - 1}
							onclick={() => moveField(index, 1)}
						>
							<i class="ri-arrow-down-line" aria-hidden="true"></i>
						</button>
						<button
							type="button"
							class="form-builder__icon-btn form-builder__icon-btn--danger"
							aria-label="Remove field"
							onclick={() => removeField(f.key)}
						>
							<i class="ri-delete-bin-line" aria-hidden="true"></i>
						</button>
					</div>
				</div>

				<input
					class="field__input"
					bind:value={f.label}
					placeholder={f.field_type === 'section' ? 'Section heading' : 'Question / label'}
					maxlength={200}
				/>

				{#if f.field_type === 'dropdown'}
					<div class="form-builder__options">
						{#each f.options as opt, oi (oi)}
							<div class="form-builder__option">
								<input
									class="field__input"
									value={opt}
									placeholder={`Option ${oi + 1}`}
									maxlength={120}
									oninput={(e) => updateOption(f.key, oi, e.currentTarget.value)}
								/>
								<button
									type="button"
									class="form-builder__icon-btn form-builder__icon-btn--danger"
									aria-label="Remove option"
									onclick={() => removeOption(f.key, oi)}
								>
									<i class="ri-close-line" aria-hidden="true"></i>
								</button>
							</div>
						{/each}
						<button type="button" class="form-builder__add-option" onclick={() => addOption(f.key)}>
							<i class="ri-add-line" aria-hidden="true"></i> Add option
						</button>
					</div>
				{/if}

				{#if f.field_type !== 'section'}
					<div class="form-builder__field-foot">
						<input
							class="field__input form-builder__help"
							bind:value={f.help_text}
							placeholder="Help text (optional)"
							maxlength={500}
						/>
						<label class="form-builder__required">
							<input type="checkbox" bind:checked={f.required} />
							Required
						</label>
					</div>
				{/if}
			</div>
		{/each}

		<button type="button" class="form-builder__add" onclick={addField}>
			<i class="ri-add-line" aria-hidden="true"></i>
			Add field
		</button>
	</div>

	<div class="form-builder__bar">
		<Button href={resolve('/settings/job-forms')} variant="ghost">Cancel</Button>
		<Button loading={saving} loadingLabel="Saving…" onclick={() => void save()}>
			<i class="ri-save-line" aria-hidden="true"></i>
			{templateId ? 'Save form' : 'Create form'}
		</Button>
	</div>
</div>
