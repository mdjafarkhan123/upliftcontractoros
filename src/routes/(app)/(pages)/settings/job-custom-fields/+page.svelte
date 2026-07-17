<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { JobCustomFieldDef, JobCustomFieldType } from '$lib/types/jobs';

	let items = $state<JobCustomFieldDef[]>([]);
	let loading = $state(true);

	const TYPE_OPTIONS: { value: JobCustomFieldType; label: string; icon: string }[] = [
		{ value: 'short_text', label: 'Text', icon: 'ri-text' },
		{ value: 'number', label: 'Number', icon: 'ri-hashtag' },
		{ value: 'date', label: 'Date', icon: 'ri-calendar-line' },
		{ value: 'dropdown', label: 'Dropdown', icon: 'ri-list-check' },
		{ value: 'checkbox', label: 'Checkbox', icon: 'ri-checkbox-line' },
		{ value: 'link', label: 'Link', icon: 'ri-link' }
	];
	const typeLabel = (t: JobCustomFieldType) => TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;

	async function load() {
		loading = true;
		try {
			const res = await fetch('/api/job-custom-fields');
			if (!res.ok) {
				toast.error('Could not load custom fields.');
				return;
			}
			const body = (await res.json()) as { data: { items: JobCustomFieldDef[] } };
			items = body.data.items;
		} finally {
			loading = false;
		}
	}

	onMount(load);

	// ── Editor (create + edit share one inline form) ──────────────────────────────
	type Editor = {
		id: string | null; // null = creating
		field_type: JobCustomFieldType;
		label: string;
		help_text: string;
		required: boolean;
		options: string[];
	};
	let editor = $state<Editor | null>(null);
	let saving = $state(false);
	let editorError = $state('');

	function openNew() {
		editorError = '';
		editor = {
			id: null,
			field_type: 'short_text',
			label: '',
			help_text: '',
			required: false,
			options: ['']
		};
	}

	function openEdit(f: JobCustomFieldDef) {
		editorError = '';
		editor = {
			id: f.id,
			field_type: f.field_type,
			label: f.label,
			help_text: f.help_text ?? '',
			required: f.required,
			options: f.options && f.options.length > 0 ? [...f.options] : ['']
		};
	}

	function closeEditor() {
		editor = null;
		editorError = '';
	}

	function addOption() {
		if (editor) editor.options = [...editor.options, ''];
	}
	function removeOption(i: number) {
		if (editor) editor.options = editor.options.filter((_, idx) => idx !== i);
	}

	async function saveEditor() {
		if (!editor) return;
		editorError = '';
		const label = editor.label.trim();
		if (!label) {
			editorError = 'Label is required.';
			return;
		}
		const cleanOptions = editor.options.map((o) => o.trim()).filter((o) => o.length > 0);
		if (editor.field_type === 'dropdown' && cleanOptions.length < 1) {
			editorError = 'Add at least one dropdown option.';
			return;
		}

		saving = true;
		try {
			const isNew = editor.id === null;
			const url = isNew ? '/api/job-custom-fields' : `/api/job-custom-fields/${editor.id}`;
			const payload: Record<string, unknown> = {
				label,
				help_text: editor.help_text.trim() || null,
				required: editor.required,
				options: editor.field_type === 'dropdown' ? cleanOptions : null
			};
			// field_type is only settable on create (immutable afterwards).
			if (isNew) payload.field_type = editor.field_type;

			const res = await fetch(url, {
				method: isNew ? 'POST' : 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				editorError = body.error ?? 'Could not save.';
				return;
			}
			toast.success(isNew ? 'Field added' : 'Field updated');
			closeEditor();
			await load();
		} catch {
			editorError = 'Network error. Try again.';
		} finally {
			saving = false;
		}
	}

	// ── Reorder (swap position values with the neighbor, then persist both) ─────────
	let reordering = $state(false);
	async function move(index: number, dir: -1 | 1) {
		const target = index + dir;
		if (reordering || target < 0 || target >= items.length) return;
		reordering = true;
		const a = items[index];
		const b = items[target];
		const aPos = a.position;
		const bPos = b.position;
		try {
			const [r1, r2] = await Promise.all([
				fetch(`/api/job-custom-fields/${a.id}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ position: Number(bPos) })
				}),
				fetch(`/api/job-custom-fields/${b.id}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ position: Number(aPos) })
				})
			]);
			if (!r1.ok || !r2.ok) {
				toast.error('Could not reorder.');
				return;
			}
			await load();
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			reordering = false;
		}
	}

	// ── Delete ─────────────────────────────────────────────────────────────────────
	let deleteTarget = $state<JobCustomFieldDef | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state(false);

	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (ConfirmDialog || !deleteOpen) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});

	async function remove(id: string) {
		deleting = true;
		try {
			const res = await fetch(`/api/job-custom-fields/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				toast.error('Delete failed');
				return;
			}
			items = items.filter((t) => t.id !== id);
			toast.success('Field deleted');
		} finally {
			deleting = false;
			deleteTarget = null;
		}
	}
</script>

<svelte:head><title>Job Custom Fields — Settings</title></svelte:head>

<PageWrapper
	title="Job Custom Fields"
	subtitle="Extra fields shown on every job — capture anything specific to your work"
	back="/settings"
>
	<div class="jcf">
		{#if loading}
			<SkeletonLoader lines={3} height="64px" label="Loading custom fields" />
		{:else}
			{#if items.length === 0 && !editor}
				<EmptyState
					iconClass="ri-list-settings-line"
					title="No custom fields yet"
					description="Add a field like Gate code, Permit #, or Warranty expiry. It appears on every job."
					actionLabel="New field"
					onAction={openNew}
				/>
			{:else}
				{#if !editor}
					<div class="jcf__toolbar">
						<Button onclick={openNew}>
							<i class="ri-add-line" aria-hidden="true"></i>
							New field
						</Button>
					</div>
				{/if}

				<ul class="jcf__list">
					{#each items as f, i (f.id)}
						<li class="jcf__card">
							<div class="jcf__reorder">
								<button
									type="button"
									class="jcf__move"
									aria-label="Move up"
									disabled={i === 0 || reordering}
									onclick={() => move(i, -1)}
								>
									<i class="ri-arrow-up-s-line" aria-hidden="true"></i>
								</button>
								<button
									type="button"
									class="jcf__move"
									aria-label="Move down"
									disabled={i === items.length - 1 || reordering}
									onclick={() => move(i, 1)}
								>
									<i class="ri-arrow-down-s-line" aria-hidden="true"></i>
								</button>
							</div>
							<div class="jcf__body">
								<span class="jcf__name">{f.label}</span>
								<span class="jcf__meta">
									<span class="jcf__badge">{typeLabel(f.field_type)}</span>
									{#if f.required}<span class="jcf__badge jcf__badge--req">Required</span>{/if}
									{#if f.field_type === 'dropdown' && f.options}
										<span class="jcf__opts">{f.options.length} options</span>
									{/if}
								</span>
							</div>
							<div class="jcf__actions">
								<button
									type="button"
									class="jcf__icon-btn"
									aria-label="Edit field"
									onclick={() => openEdit(f)}
								>
									<i class="ri-pencil-line" aria-hidden="true"></i>
								</button>
								<button
									type="button"
									class="jcf__icon-btn jcf__icon-btn--danger"
									aria-label="Delete field"
									onclick={() => {
										deleteTarget = f;
										deleteOpen = true;
									}}
								>
									<i class="ri-delete-bin-line" aria-hidden="true"></i>
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}

			{#if editor}
				<div class="jcf__editor">
					<h3 class="jcf__editor-title">{editor.id ? 'Edit field' : 'New field'}</h3>

					<div class="field">
						<span class="field__label">Type</span>
						{#if editor.id}
							<p class="jcf__type-static">
								{typeLabel(editor.field_type)} <span>· can't be changed</span>
							</p>
						{:else}
							<div class="jcf__type-grid">
								{#each TYPE_OPTIONS as opt (opt.value)}
									<button
										type="button"
										class="jcf__type-btn"
										class:jcf__type-btn--active={editor.field_type === opt.value}
										onclick={() => {
											if (editor) editor.field_type = opt.value;
										}}
									>
										<i class={opt.icon} aria-hidden="true"></i>
										{opt.label}
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<div class="field">
						<label class="field__label" for="jcf-label">Label</label>
						<input
							id="jcf-label"
							class="field__input"
							type="text"
							bind:value={editor.label}
							placeholder="e.g. Gate code"
							maxlength="120"
						/>
					</div>

					<div class="field">
						<label class="field__label" for="jcf-help"
							>Help text <span class="jcf__optional">(optional)</span></label
						>
						<input
							id="jcf-help"
							class="field__input"
							type="text"
							bind:value={editor.help_text}
							placeholder="Hint shown under the field"
							maxlength="500"
						/>
					</div>

					{#if editor.field_type === 'dropdown'}
						<div class="field">
							<span class="field__label">Options</span>
							<div class="jcf__options">
								{#each editor.options as _opt, oi (oi)}
									<div class="jcf__option-row">
										<input
											class="field__input"
											type="text"
											bind:value={editor.options[oi]}
											placeholder="Option {oi + 1}"
											maxlength="120"
										/>
										<button
											type="button"
											class="jcf__icon-btn jcf__icon-btn--danger"
											aria-label="Remove option"
											disabled={editor.options.length <= 1}
											onclick={() => removeOption(oi)}
										>
											<i class="ri-close-line" aria-hidden="true"></i>
										</button>
									</div>
								{/each}
								<button type="button" class="jcf__add-option" onclick={addOption}>
									<i class="ri-add-line" aria-hidden="true"></i>
									Add option
								</button>
							</div>
						</div>
					{/if}

					<label class="jcf__required">
						<input type="checkbox" bind:checked={editor.required} />
						<span>Required — must be filled when saving a job</span>
					</label>

					{#if editorError}
						<div class="ui-alert ui-alert--destructive">{editorError}</div>
					{/if}

					<div class="jcf__editor-actions">
						<Button variant="ghost" disabled={saving} onclick={closeEditor}>Cancel</Button>
						<Button loading={saving} loadingLabel="Saving…" onclick={saveEditor}>
							{editor.id ? 'Save changes' : 'Add field'}
						</Button>
					</div>
				</div>
			{/if}
		{/if}
	</div>

	{#if ConfirmDialog}
		<ConfirmDialog
			bind:open={deleteOpen}
			title="Delete custom field"
			description={deleteTarget
				? `Delete "${deleteTarget.label}"? It's removed from every job. Existing values are hidden.`
				: ''}
			confirmLabel="Delete"
			variant="destructive"
			loading={deleting}
			onConfirm={() => {
				if (deleteTarget) void remove(deleteTarget.id);
			}}
		/>
	{/if}
</PageWrapper>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.jcf {
		&__toolbar {
			display: flex;
			justify-content: flex-end;
			margin-bottom: $space-3;
		}

		&__list {
			list-style: none;
			margin: 0 0 $space-4;
			padding: 0;
			display: flex;
			flex-direction: column;
			gap: $space-2;
		}

		&__card {
			display: flex;
			align-items: center;
			gap: $space-3;
			padding: $space-3;
			border: 1px solid var(--color-border);
			border-radius: $radius-lg;
			background: var(--color-bg-surface);
		}

		&__reorder {
			display: flex;
			flex-direction: column;
			flex-shrink: 0;
		}

		&__move {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 24px;
			height: 20px;
			border: none;
			background: transparent;
			color: var(--color-text-muted);
			cursor: pointer;
			border-radius: $radius-sm;

			&:hover:not(:disabled) {
				background: var(--color-bg-surface-sunk);
				color: var(--color-text-primary);
			}

			&:disabled {
				opacity: 0.3;
				cursor: not-allowed;
			}
		}

		&__body {
			flex: 1;
			min-width: 0;
			display: flex;
			flex-direction: column;
			gap: $space-1;
		}

		&__name {
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
		}

		&__meta {
			display: flex;
			align-items: center;
			gap: $space-2;
			flex-wrap: wrap;
		}

		&__badge {
			padding: 2px $space-2;
			border-radius: $radius-full;
			background: var(--color-bg-surface-sunk);
			color: var(--color-text-secondary);
			font-size: $fs-caption;
			font-weight: $weight-semibold;

			&--req {
				background: var(--warning-bg);
				color: var(--warning-text);
			}
		}

		&__opts {
			font-size: $fs-caption;
			color: var(--color-text-muted);
		}

		&__actions {
			display: flex;
			align-items: center;
			gap: $space-1;
			flex-shrink: 0;
		}

		&__icon-btn {
			width: 32px;
			height: 32px;
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

			&:hover:not(:disabled) {
				background: var(--color-bg-surface-sunk);
				color: var(--color-text-primary);
			}

			&--danger:hover:not(:disabled) {
				background: var(--danger-bg);
				color: var(--danger-text);
			}

			&:disabled {
				opacity: 0.4;
				cursor: not-allowed;
			}
		}

		&__editor {
			border: 1px solid var(--color-border-strong);
			border-radius: $radius-lg;
			background: var(--color-bg-surface-sunk);
			padding: $space-4;
			display: flex;
			flex-direction: column;
			gap: $space-4;
		}

		&__editor-title {
			margin: 0;
			font-size: $fs-lg;
			font-weight: $weight-bold;
			color: var(--color-text-primary);
		}

		&__type-static {
			margin: 0;
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);

			span {
				font-weight: $weight-regular;
				color: var(--color-text-muted);
			}
		}

		&__type-grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
			gap: $space-2;
		}

		&__type-btn {
			display: inline-flex;
			align-items: center;
			gap: $space-2;
			padding: $space-2 $space-3;
			border: 1px solid var(--color-border);
			border-radius: $radius-md;
			background: var(--color-bg-surface);
			color: var(--color-text-secondary);
			font-size: $fs-body;
			font-weight: $weight-medium;
			cursor: pointer;
			transition: all $duration-fast $ease-standard;

			&:hover {
				border-color: var(--color-brand);
			}

			&--active {
				border-color: var(--color-brand);
				background: var(--color-brand-subtle, var(--color-bg-surface));
				color: var(--color-brand);
			}
		}

		&__optional {
			font-weight: $weight-regular;
			color: var(--color-text-muted);
		}

		&__options {
			display: flex;
			flex-direction: column;
			gap: $space-2;
		}

		&__option-row {
			display: flex;
			align-items: center;
			gap: $space-2;
		}

		&__add-option {
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			align-self: flex-start;
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

		&__required {
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

		&__editor-actions {
			display: flex;
			justify-content: flex-end;
			gap: $space-2;
		}
	}
</style>
