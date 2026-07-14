<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from '$lib/stores/toast.svelte';
	import { jobDetailStore } from '$lib/stores/jobDetail.svelte';
	import type { JobCustomFieldRow } from '$lib/types/jobs';
	import { Button } from '$lib/components/ui/button';

	let {
		jobId,
		customFields,
		canManage
	}: {
		jobId: string;
		customFields: JobCustomFieldRow[];
		// Edit access to the job (same gate as tasks/forms).
		canManage: boolean;
	} = $props();

	let editing = $state(false);
	let saving = $state(false);
	// Editable answers keyed by field id: string (text/number/date/dropdown/link) or boolean (checkbox).
	let draft = $state<Record<string, string | boolean>>({});
	// Required fields flagged empty on the last Save attempt.
	const errorFieldIds = new SvelteSet<string>();

	function seedDraft() {
		const d: Record<string, string | boolean> = {};
		for (const f of customFields) {
			if (f.field_type === 'checkbox') d[f.id] = f.value_bool ?? false;
			else if (f.field_type === 'number') d[f.id] = f.value_number ?? '';
			else if (f.field_type === 'date') d[f.id] = f.value_date ?? '';
			else d[f.id] = f.value_text ?? '';
		}
		draft = d;
	}

	function startEdit() {
		errorFieldIds.clear();
		seedDraft();
		editing = true;
	}

	function cancelEdit() {
		editing = false;
		draft = {};
		errorFieldIds.clear();
	}

	function clearFieldError(id: string) {
		errorFieldIds.delete(id);
	}

	function filled(f: JobCustomFieldRow): boolean {
		const v = draft[f.id];
		switch (f.field_type) {
			case 'checkbox':
				return v === true;
			case 'number':
				return v !== '' && v !== null && v !== undefined;
			default:
				return typeof v === 'string' ? v.trim().length > 0 : !!v;
		}
	}

	function buildValues() {
		return customFields.map((f) => {
			const v = draft[f.id];
			if (f.field_type === 'checkbox') return { field_id: f.id, value_bool: !!v };
			if (f.field_type === 'number')
				return { field_id: f.id, value_number: v === '' || v == null ? null : Number(v) };
			if (f.field_type === 'date') return { field_id: f.id, value_date: v ? String(v) : null };
			return { field_id: f.id, value_text: v ? String(v) : null };
		});
	}

	async function save() {
		// Client-side required gate (server re-checks): highlight gaps rather than bounce a request.
		const missing = customFields.filter((f) => f.required && !filled(f));
		if (missing.length > 0) {
			errorFieldIds.clear();
			for (const f of missing) errorFieldIds.add(f.id);
			toast.error(
				`Fill the required field${missing.length > 1 ? 's' : ''}: ${missing.map((f) => f.label).join(', ')}`
			);
			return;
		}
		errorFieldIds.clear();
		saving = true;
		try {
			const res = await fetch(`/api/jobs/${jobId}/custom-fields`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ values: buildValues() })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				if (body.field_errors) {
					errorFieldIds.clear();
					for (const k of Object.keys(body.field_errors)) errorFieldIds.add(k);
				}
				toast.error(body.error ?? 'Could not save.');
				return;
			}
			jobDetailStore.patch(jobId, (prev) => ({ ...prev, custom_fields: body.data.custom_fields }));
			toast.success('Custom fields saved');
			editing = false;
			draft = {};
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			saving = false;
		}
	}

	// A field's display value in read mode (null when empty → shows an em-dash).
	function displayValue(f: JobCustomFieldRow): string | null {
		switch (f.field_type) {
			case 'checkbox':
				return f.value_bool ? 'Yes' : 'No';
			case 'number':
				return f.value_number ?? null;
			case 'date':
				return f.value_date
					? new Date(f.value_date + 'T00:00:00').toLocaleDateString(undefined, {
							month: 'short',
							day: 'numeric',
							year: 'numeric'
						})
					: null;
			default:
				return f.value_text && f.value_text.trim() ? f.value_text : null;
		}
	}

	const hasAny = $derived(customFields.length > 0);
</script>

{#if hasAny}
	<section class="job-section job-cf">
		<div class="job-section__head">
			<div class="job-section__head-main">
				<i class="ri-list-settings-line job-section__icon" aria-hidden="true"></i>
				<h2 class="job-section__title">Custom fields</h2>
			</div>
			{#if canManage && !editing}
				<Button variant="ghost" size="sm" onclick={startEdit}>
					<i class="ri-pencil-line" aria-hidden="true"></i>
					Edit
				</Button>
			{/if}
		</div>

		{#if editing}
			<div class="job-cf__form">
				{#each customFields as f (f.id)}
					<div class="field" class:job-cf__field--invalid={errorFieldIds.has(f.id)}>
						{#if f.field_type === 'checkbox'}
							<label class="job-cf__checkbox">
								<input
									type="checkbox"
									bind:checked={draft[f.id] as boolean}
									onchange={() => clearFieldError(f.id)}
								/>
								<span>
									{f.label}{#if f.required}<span class="job-cf__req">*</span>{/if}
								</span>
							</label>
							{#if f.help_text}<p class="job-cf__help">{f.help_text}</p>{/if}
						{:else}
							<label class="field__label" for="jcf-{f.id}">
								{f.label}{#if f.required}<span class="job-cf__req">*</span>{/if}
							</label>
							{#if f.help_text}<p class="job-cf__help">{f.help_text}</p>{/if}

							{#if f.field_type === 'short_text'}
								<input
									id="jcf-{f.id}"
									class="field__input"
									type="text"
									bind:value={draft[f.id]}
									oninput={() => clearFieldError(f.id)}
									maxlength="2000"
								/>
							{:else if f.field_type === 'link'}
								<input
									id="jcf-{f.id}"
									class="field__input"
									type="url"
									inputmode="url"
									placeholder="https://…"
									bind:value={draft[f.id]}
									oninput={() => clearFieldError(f.id)}
									maxlength="2000"
								/>
							{:else if f.field_type === 'number'}
								<input
									id="jcf-{f.id}"
									class="field__input"
									type="number"
									bind:value={draft[f.id]}
									oninput={() => clearFieldError(f.id)}
								/>
							{:else if f.field_type === 'date'}
								<input
									id="jcf-{f.id}"
									class="field__input"
									type="date"
									bind:value={draft[f.id]}
									oninput={() => clearFieldError(f.id)}
								/>
							{:else if f.field_type === 'dropdown'}
								<select
									id="jcf-{f.id}"
									class="field__input"
									bind:value={draft[f.id]}
									onchange={() => clearFieldError(f.id)}
								>
									<option value="">Select…</option>
									{#each f.options ?? [] as opt (opt)}
										<option value={opt}>{opt}</option>
									{/each}
								</select>
							{/if}
						{/if}
					</div>
				{/each}

				<div class="job-cf__actions">
					<Button variant="ghost" size="sm" onclick={cancelEdit} disabled={saving}>
						Cancel
					</Button>
					<Button size="sm" loading={saving} onclick={save}>
						Save
					</Button>
				</div>
			</div>
		{:else}
			<dl class="job-cf__list">
				{#each customFields as f (f.id)}
					{@const val = displayValue(f)}
					<div class="job-cf__row">
						<dt class="job-cf__label">{f.label}</dt>
						<dd class="job-cf__value">
							{#if val === null}
								<span class="job-cf__empty">—</span>
							{:else if f.field_type === 'link'}
								<a href={val} target="_blank" rel="noopener noreferrer" class="job-cf__link">
									{val}
									<i class="ri-external-link-line" aria-hidden="true"></i>
								</a>
							{:else}
								{val}
							{/if}
						</dd>
					</div>
				{/each}
			</dl>
		{/if}
	</section>
{/if}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.job-cf {
		&__list {
			margin: 0;
			display: flex;
			flex-direction: column;
		}

		&__row {
			display: grid;
			grid-template-columns: minmax(120px, 34%) 1fr;
			gap: $space-3;
			padding: $space-2 0;
			border-bottom: 1px solid var(--color-border);

			&:last-child {
				border-bottom: none;
			}
		}

		&__label {
			margin: 0;
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-secondary);
		}

		&__value {
			margin: 0;
			font-size: $fs-body;
			color: var(--color-text-primary);
			word-break: break-word;
		}

		&__empty {
			color: var(--color-text-muted);
		}

		&__link {
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			color: var(--color-brand);

			&:hover {
				text-decoration: underline;
			}

			i {
				font-size: 0.9em;
			}
		}

		&__form {
			display: flex;
			flex-direction: column;
			gap: $space-3;
		}

		&__help {
			margin: 0 0 $space-1;
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__req {
			margin-left: 2px;
			color: var(--danger-text);
		}

		&__checkbox {
			display: inline-flex;
			align-items: center;
			gap: $space-2;
			font-size: $fs-body;
			color: var(--color-text-primary);
			cursor: pointer;

			input {
				width: 18px;
				height: 18px;
			}
		}

		&__field--invalid {
			padding: $space-2 $space-3;
			margin: 0 (-$space-3);
			border-radius: $radius-md;
			background: var(--danger-bg);

			:global(.field__label) {
				color: var(--danger-text);
			}

			:global(.field__input) {
				border-color: var(--danger-text);
			}
		}

		&__actions {
			display: flex;
			justify-content: flex-end;
			gap: $space-2;
		}
	}
</style>
