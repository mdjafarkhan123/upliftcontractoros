<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from '$lib/stores/toast.svelte';
	import { jobDetailStore } from '$lib/stores/jobDetail.svelte';
	import JobFormPhotoField from './JobFormPhotoField.svelte';
	import JobFormSignatureField from './JobFormSignatureField.svelte';
	import { Button } from '$lib/components/ui/button';
	import type {
		JobFormSubmissionRow,
		JobFormSubmissionFieldRow,
		JobFormFieldMedia,
		JobFormTemplateOption
	} from '$lib/types/jobs';

	let {
		jobId,
		submissions,
		canManage
	}: {
		jobId: string;
		submissions: JobFormSubmissionRow[];
		// Edit access to the job (same gate as tasks/time) — add, fill, complete, remove forms.
		canManage: boolean;
	} = $props();

	// Scalar (typed-answer) fields the crew edits via the `draft` map. Photo/signature carry their
	// answer as attached media, not a draft value; 'section' is a heading with no answer.
	const SCALAR = new Set(['short_text', 'long_text', 'number', 'checkbox', 'dropdown', 'date']);

	// Is a field considered answered, for the progress bar? Photo/signature = has ≥1 file (media
	// updates the store on upload, so this stays live); scalars read the saved value.
	function isAnswered(f: JobFormSubmissionFieldRow): boolean {
		switch (f.field_type) {
			case 'photo':
			case 'signature':
				return f.media.length > 0;
			case 'checkbox':
				return f.value_bool !== null;
			case 'number':
				return f.value_number !== null && f.value_number !== '';
			case 'date':
				return !!f.value_date;
			case 'short_text':
			case 'long_text':
			case 'dropdown':
				return !!(f.value_text && f.value_text.trim());
			default:
				return false;
		}
	}

	function progress(s: JobFormSubmissionRow): { done: number; total: number } {
		const answerable = s.fields.filter((f) => f.field_type !== 'section');
		return { done: answerable.filter(isAnswered).length, total: answerable.length };
	}

	function applyResult(data: { form_submissions: JobFormSubmissionRow[] }) {
		jobDetailStore.patch(jobId, (prev) => ({ ...prev, form_submissions: data.form_submissions }));
	}

	// ── Add form (template picker) ────────────────────────────────────────────────
	let pickerOpen = $state(false);
	let templates = $state<JobFormTemplateOption[]>([]);
	let templatesLoaded = $state(false);
	let templatesLoading = $state(false);
	let attaching = $state(false);
	// Which template row is being attached, so only that picker item shows a spinner.
	let attachingId = $state<string | null>(null);

	async function openPicker() {
		pickerOpen = true;
		if (templatesLoaded || templatesLoading) return;
		templatesLoading = true;
		try {
			const r = await fetch('/api/job-form-templates');
			if (r.ok) {
				const body = (await r.json()) as { data: { items: JobFormTemplateOption[] } };
				templates = body.data.items;
				templatesLoaded = true;
			} else {
				toast.error('Could not load forms.');
			}
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			templatesLoading = false;
		}
	}

	async function attach(templateId: string) {
		if (attaching) return;
		attaching = true;
		attachingId = templateId;
		try {
			const res = await fetch(`/api/jobs/${jobId}/form-submissions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ template_id: templateId })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not add form.');
				return;
			}
			applyResult(body.data);
			pickerOpen = false;
			// Expand the newly attached form (it's the last one) so the crew can start filling.
			const list = body.data.form_submissions as JobFormSubmissionRow[];
			const added = list[list.length - 1];
			if (added) openFill(added);
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			attaching = false;
			attachingId = null;
		}
	}

	// ── Fill / edit one form ──────────────────────────────────────────────────────
	let expandedId = $state<string | null>(null);
	// Local editable answers for the expanded form: field id → string (text/number/date) or boolean.
	let draft = $state<Record<string, string | boolean>>({});
	// Required fields flagged empty on the last "Mark complete" attempt — highlighted inline.
	const errorFieldIds = new SvelteSet<string>();
	let saving = $state(false);
	// Which save action is in flight, so only the button that was clicked shows a spinner
	// (all three share the `saving` disable gate).
	let savingAction = $state<'answers' | 'complete' | 'reopen' | null>(null);

	function seedDraft(s: JobFormSubmissionRow) {
		const d: Record<string, string | boolean> = {};
		for (const f of s.fields) {
			if (!SCALAR.has(f.field_type)) continue;
			if (f.field_type === 'checkbox') d[f.id] = f.value_bool ?? false;
			else if (f.field_type === 'number') d[f.id] = f.value_number ?? '';
			else if (f.field_type === 'date') d[f.id] = f.value_date ?? '';
			else d[f.id] = f.value_text ?? '';
		}
		draft = d;
	}

	function openFill(s: JobFormSubmissionRow) {
		expandedId = s.id;
		errorFieldIds.clear();
		seedDraft(s);
	}

	function closeFill() {
		expandedId = null;
		draft = {};
		errorFieldIds.clear();
	}

	// Drop a field's error highlight the moment the crew edits it.
	function clearFieldError(id: string) {
		errorFieldIds.delete(id);
	}

	// Is a required field satisfied, judged from the LIVE editing state (draft for scalars,
	// attached media for photo/signature)? Drives the client-side complete gate.
	function fieldFilledForGate(f: JobFormSubmissionFieldRow): boolean {
		if (f.field_type === 'photo' || f.field_type === 'signature') return f.media.length > 0;
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

	function requiredMissing(s: JobFormSubmissionRow): JobFormSubmissionFieldRow[] {
		return s.fields.filter(
			(f) => f.required && f.field_type !== 'section' && !fieldFilledForGate(f)
		);
	}

	// ── Photo/signature media, mutated straight into the store so progress/gate stay live ──
	function patchFieldMedia(
		fieldId: string,
		mutate: (m: JobFormFieldMedia[]) => JobFormFieldMedia[]
	) {
		jobDetailStore.patch(jobId, (prev) => ({
			...prev,
			form_submissions: prev.form_submissions.map((s) => ({
				...s,
				fields: s.fields.map((f) => (f.id === fieldId ? { ...f, media: mutate(f.media) } : f))
			}))
		}));
	}

	function onMediaAdded(fieldId: string, item: JobFormFieldMedia) {
		patchFieldMedia(fieldId, (m) => [...m, item]);
		clearFieldError(fieldId);
	}

	function onMediaRemoved(fieldId: string, id: string) {
		patchFieldMedia(fieldId, (m) => m.filter((x) => x.id !== id));
	}

	function buildAnswers(s: JobFormSubmissionRow) {
		return s.fields
			.filter((f) => SCALAR.has(f.field_type))
			.map((f) => {
				const v = draft[f.id];
				if (f.field_type === 'checkbox') return { field_id: f.id, value_bool: !!v };
				if (f.field_type === 'number')
					return { field_id: f.id, value_number: v === '' ? null : Number(v) };
				if (f.field_type === 'date') return { field_id: f.id, value_date: v ? String(v) : null };
				return { field_id: f.id, value_text: v ? String(v) : null };
			});
	}

	async function patchSubmission(
		s: JobFormSubmissionRow,
		payload: Record<string, unknown>,
		action: 'answers' | 'complete' | 'reopen',
		okMsg?: string
	) {
		saving = true;
		savingAction = action;
		try {
			const res = await fetch(`/api/jobs/${jobId}/form-submissions/${s.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				// Backstop: if the server rejects a completion for empty required fields, mirror its
				// field_errors into the inline highlight (the client gate should catch this first).
				if (body.field_errors) {
					errorFieldIds.clear();
					for (const k of Object.keys(body.field_errors)) errorFieldIds.add(k);
				}
				toast.error(body.error ?? 'Could not save.');
				return false;
			}
			applyResult(body.data);
			if (okMsg) toast.success(okMsg);
			return true;
		} catch {
			toast.error('Network error. Try again.');
			return false;
		} finally {
			saving = false;
			savingAction = null;
		}
	}

	async function saveAnswers(s: JobFormSubmissionRow) {
		if (await patchSubmission(s, { answers: buildAnswers(s) }, 'answers', 'Answers saved'))
			closeFill();
	}

	async function complete(s: JobFormSubmissionRow) {
		// Jobber-style gate: block completion until every required field is filled, highlighting the
		// gaps inline rather than firing a request that would just bounce. The server re-checks.
		const missing = requiredMissing(s);
		if (missing.length > 0) {
			errorFieldIds.clear();
			for (const f of missing) errorFieldIds.add(f.id);
			toast.error(
				`Complete the required field${missing.length > 1 ? 's' : ''}: ${missing
					.map((f) => f.label)
					.join(', ')}`
			);
			return;
		}
		errorFieldIds.clear();
		// Save current answers and mark done in one call.
		if (
			await patchSubmission(
				s,
				{ answers: buildAnswers(s), status: 'completed' },
				'complete',
				'Form completed'
			)
		)
			closeFill();
	}

	async function reopen(s: JobFormSubmissionRow) {
		await patchSubmission(s, { status: 'in_progress' }, 'reopen', 'Form reopened');
	}

	let removingId = $state<string | null>(null);
	async function remove(s: JobFormSubmissionRow) {
		if (!confirm(`Remove "${s.template_name}" from this job?`)) return;
		removingId = s.id;
		try {
			const res = await fetch(`/api/jobs/${jobId}/form-submissions/${s.id}`, { method: 'DELETE' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not remove form.');
				return;
			}
			applyResult(body.data);
			if (expandedId === s.id) closeFill();
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			removingId = null;
		}
	}

	const hasForms = $derived(submissions.length > 0);
</script>

<section class="job-section job-forms">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="ri-survey-line job-section__icon" aria-hidden="true"></i>
			<h2 class="job-section__title">Forms</h2>
		</div>
	</div>

	{#if !hasForms}
		<p class="job-forms__empty">
			No forms yet. Attach an inspection or checklist form for the crew to fill on site.
		</p>
	{/if}

	<ul class="job-forms__list">
		{#each submissions as s (s.id)}
			{@const p = progress(s)}
			{@const done = s.status === 'completed'}
			<li class="job-forms__item" class:job-forms__item--done={done}>
				<div class="job-forms__row">
					<button
						type="button"
						class="job-forms__toggle"
						aria-expanded={expandedId === s.id}
						onclick={() => (expandedId === s.id ? closeFill() : openFill(s))}
					>
						<i
							class={expandedId === s.id ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'}
							aria-hidden="true"
						></i>
						<span class="job-forms__name">{s.template_name}</span>
					</button>

					<div class="job-forms__row-meta">
						{#if done}
							<span class="job-forms__badge job-forms__badge--done">
								<i class="ri-checkbox-circle-fill" aria-hidden="true"></i>
								Completed
							</span>
						{:else}
							<span class="job-forms__badge">{p.done} / {p.total}</span>
						{/if}
						{#if canManage}
							<button
								type="button"
								class="job-forms__icon-btn job-forms__icon-btn--danger"
								aria-label="Remove form"
								disabled={removingId === s.id}
								onclick={() => remove(s)}
							>
								{#if removingId === s.id}
									<i class="ri-loader-4-line job-section__spin" aria-hidden="true"></i>
								{:else}
									<i class="ri-delete-bin-line" aria-hidden="true"></i>
								{/if}
							</button>
						{/if}
					</div>
				</div>

				{#if !done && p.total > 0}
					<div class="job-forms__progress" role="presentation">
						<div
							class="job-forms__progress-bar"
							style="width: {p.total > 0 ? Math.round((p.done / p.total) * 100) : 0}%"
						></div>
					</div>
				{/if}

				{#if expandedId === s.id}
					<div class="job-forms__fill">
						{#each s.fields as f (f.id)}
							{#if f.field_type === 'section'}
								<h3 class="job-forms__section-head">{f.label}</h3>
							{:else if f.field_type === 'photo'}
								<div class="field" class:job-forms__field--invalid={errorFieldIds.has(f.id)}>
									<p class="field__label">
										{f.label}{#if f.required}<span class="job-forms__req">*</span>{/if}
									</p>
									{#if f.help_text}
										<p class="job-forms__help">{f.help_text}</p>
									{/if}
									<JobFormPhotoField
										{jobId}
										fieldId={f.id}
										photos={f.media}
										canEdit={canManage && !done}
										onAdded={(item) => onMediaAdded(f.id, item)}
										onRemoved={(id) => onMediaRemoved(f.id, id)}
									/>
								</div>
							{:else if f.field_type === 'signature'}
								<div class="field" class:job-forms__field--invalid={errorFieldIds.has(f.id)}>
									<p class="field__label">
										{f.label}{#if f.required}<span class="job-forms__req">*</span>{/if}
									</p>
									{#if f.help_text}
										<p class="job-forms__help">{f.help_text}</p>
									{/if}
									<JobFormSignatureField
										{jobId}
										fieldId={f.id}
										signature={f.media[0] ?? null}
										canEdit={canManage && !done}
										onSaved={(item) => onMediaAdded(f.id, item)}
										onCleared={(id) => onMediaRemoved(f.id, id)}
									/>
								</div>
							{:else}
								<div class="field" class:job-forms__field--invalid={errorFieldIds.has(f.id)}>
									<label class="field__label" for="jf-{f.id}">
										{f.label}{#if f.required}<span class="job-forms__req">*</span>{/if}
									</label>
									{#if f.help_text}
										<p class="job-forms__help">{f.help_text}</p>
									{/if}

									{#if f.field_type === 'short_text'}
										<input
											id="jf-{f.id}"
											class="field__input"
											type="text"
											bind:value={draft[f.id]}
											oninput={() => clearFieldError(f.id)}
											disabled={!canManage || done}
											maxlength="5000"
										/>
									{:else if f.field_type === 'long_text'}
										<textarea
											id="jf-{f.id}"
											class="field__input"
											rows="3"
											bind:value={draft[f.id]}
											oninput={() => clearFieldError(f.id)}
											disabled={!canManage || done}
											maxlength="5000"
										></textarea>
									{:else if f.field_type === 'number'}
										<input
											id="jf-{f.id}"
											class="field__input"
											type="number"
											bind:value={draft[f.id]}
											oninput={() => clearFieldError(f.id)}
											disabled={!canManage || done}
										/>
									{:else if f.field_type === 'date'}
										<input
											id="jf-{f.id}"
											class="field__input"
											type="date"
											bind:value={draft[f.id]}
											oninput={() => clearFieldError(f.id)}
											disabled={!canManage || done}
										/>
									{:else if f.field_type === 'dropdown'}
										<select
											id="jf-{f.id}"
											class="field__input"
											bind:value={draft[f.id]}
											onchange={() => clearFieldError(f.id)}
											disabled={!canManage || done}
										>
											<option value="">Select…</option>
											{#each f.options ?? [] as opt (opt)}
												<option value={opt}>{opt}</option>
											{/each}
										</select>
									{:else if f.field_type === 'checkbox'}
										<label class="job-forms__checkbox">
											<input
												id="jf-{f.id}"
												type="checkbox"
												bind:checked={draft[f.id] as boolean}
												onchange={() => clearFieldError(f.id)}
												disabled={!canManage || done}
											/>
											<span>Yes</span>
										</label>
									{/if}
								</div>
							{/if}
						{/each}

						{#if canManage && !done}
							<div class="job-forms__fill-actions">
								<Button variant="ghost" size="sm" onclick={closeFill} disabled={saving}>
									Close
								</Button>
								<Button
									variant="outline"
									size="sm"
									loading={savingAction === 'answers'}
									disabled={saving}
									onclick={() => saveAnswers(s)}
								>
									Save answers
								</Button>
								<Button
									size="sm"
									loading={savingAction === 'complete'}
									disabled={saving}
									onclick={() => complete(s)}
								>
									Mark complete
								</Button>
							</div>
						{:else if done}
							<div class="job-forms__completed-meta">
								{#if s.submitted_by_name}<span>Completed by {s.submitted_by_name}</span>{/if}
								{#if canManage}
									<Button
										variant="ghost"
										size="sm"
										loading={savingAction === 'reopen'}
										disabled={saving}
										onclick={() => reopen(s)}
									>
										Reopen
									</Button>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>

	{#if canManage}
		<div class="job-forms__add-wrap">
			{#if pickerOpen}
				<div class="job-forms__picker">
					<div class="job-forms__picker-head">
						<span>Choose a form</span>
						<button
							type="button"
							class="job-forms__icon-btn"
							aria-label="Close"
							onclick={() => (pickerOpen = false)}
						>
							<i class="ri-close-line" aria-hidden="true"></i>
						</button>
					</div>
					{#if templatesLoading}
						<p class="job-forms__picker-empty">Loading…</p>
					{:else if templates.length === 0}
						<p class="job-forms__picker-empty">
							No form templates yet. Build one in Settings → Job Forms.
						</p>
					{:else}
						<ul class="job-forms__picker-list">
							{#each templates as t (t.id)}
								<li>
									<button
										type="button"
										class="job-forms__picker-item"
										disabled={attaching}
										onclick={() => attach(t.id)}
									>
										<span class="job-forms__picker-name">{t.name}</span>
										{#if attachingId === t.id}
											<i class="ri-loader-4-line job-section__spin" aria-hidden="true"></i>
										{:else}
											<span class="job-forms__picker-count">{t.field_count} fields</span>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{:else}
				<button type="button" class="job-forms__add" onclick={openPicker}>
					<i class="ri-add-line" aria-hidden="true"></i>
					Add form
				</button>
			{/if}
		</div>
	{/if}
</section>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.job-forms {
		&__empty {
			font-size: $fs-body;
			color: var(--color-text-muted);
			font-style: italic;
			margin: 0 0 $space-3;
		}

		&__list {
			list-style: none;
			margin: 0;
			padding: 0;
		}

		&__item {
			padding: $space-3 0;
			border-bottom: 1px solid var(--color-border);
		}

		&__row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-3;
		}

		&__toggle {
			display: inline-flex;
			align-items: center;
			gap: $space-2;
			flex: 1;
			min-width: 0;
			padding: 0;
			border: none;
			background: transparent;
			cursor: pointer;
			text-align: left;
			color: var(--color-text-primary);

			i {
				font-size: 1.2rem;
				color: var(--color-text-muted);
				flex-shrink: 0;
			}
		}

		&__name {
			font-size: $fs-body;
			font-weight: $weight-semibold;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		&__row-meta {
			display: flex;
			align-items: center;
			gap: $space-2;
			flex-shrink: 0;
		}

		&__badge {
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			padding: 2px $space-2;
			border-radius: $radius-full;
			background: var(--color-bg-surface-sunk);
			color: var(--color-text-secondary);
			font-size: $fs-caption;
			font-weight: $weight-semibold;

			&--done {
				background: var(--success-bg);
				color: var(--success-text);
			}
		}

		&__progress {
			height: 6px;
			border-radius: $radius-full;
			background: var(--color-bg-surface-sunk);
			overflow: hidden;
			margin-top: $space-2;
		}

		&__progress-bar {
			height: 100%;
			border-radius: $radius-full;
			background: var(--color-brand);
			transition: width $duration-base $ease-standard;
		}

		&__fill {
			margin-top: $space-3;
			padding: $space-4;
			border: 1px solid var(--color-border-strong);
			border-radius: $radius-lg;
			background: var(--color-bg-surface-sunk);
			display: flex;
			flex-direction: column;
			gap: $space-3;
		}

		&__section-head {
			margin: $space-2 0 0;
			font-size: $fs-body;
			font-weight: $weight-bold;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--color-text-secondary);
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

		// A required field flagged empty on a failed "Mark complete" — draws the eye to the gap.
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

		&__fill-actions {
			display: flex;
			justify-content: flex-end;
			gap: $space-2;
			margin-top: $space-1;
		}

		&__completed-meta {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-2;
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__icon-btn {
			width: 30px;
			height: 30px;
			display: flex;
			align-items: center;
			justify-content: center;
			border: none;
			border-radius: $radius-full;
			background: transparent;
			color: var(--color-text-muted);
			cursor: pointer;
			transition:
				background-color $duration-fast $ease-standard,
				color $duration-fast $ease-standard;

			&:hover {
				background: var(--color-bg-surface-sunk);
				color: var(--color-text-primary);
			}

			&--danger:hover {
				background: var(--danger-bg);
				color: var(--danger-text);
			}

			&:disabled {
				opacity: 0.5;
				cursor: not-allowed;
			}
		}

		&__add-wrap {
			margin-top: $space-3;
		}

		&__add {
			display: inline-flex;
			align-items: center;
			gap: $space-2;
			padding: 0;
			border: none;
			background: transparent;
			color: var(--color-brand);
			font-size: $fs-body;
			font-weight: $weight-semibold;
			cursor: pointer;

			&:hover {
				text-decoration: underline;
			}
		}

		&__picker {
			border: 1px solid var(--color-border-strong);
			border-radius: $radius-lg;
			background: var(--color-bg-surface-sunk);
			padding: $space-3;
		}

		&__picker-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-secondary);
			margin-bottom: $space-2;
		}

		&__picker-empty {
			margin: $space-2 0;
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__picker-list {
			list-style: none;
			margin: 0;
			padding: 0;
			display: flex;
			flex-direction: column;
			gap: $space-1;
		}

		&__picker-item {
			width: 100%;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-3;
			padding: $space-2 $space-3;
			border: 1px solid var(--color-border);
			border-radius: $radius-md;
			background: var(--color-bg-surface);
			cursor: pointer;
			transition: border-color $duration-fast $ease-standard;

			&:hover:not(:disabled) {
				border-color: var(--color-brand);
			}

			&:disabled {
				opacity: 0.6;
				cursor: not-allowed;
			}
		}

		&__picker-name {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
		}

		&__picker-count {
			font-size: $fs-body;
			color: var(--color-text-muted);
		}
	}
</style>
