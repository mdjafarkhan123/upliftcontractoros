<script lang="ts">
	import { toast } from '$lib/stores/toast.svelte';
	import { jobDetailStore } from '$lib/stores/jobDetail.svelte';
	import type { JobTaskRow } from '$lib/types/jobs';
	import { Button } from '$lib/components/ui/button';
	import Avatar from '$lib/components/shared/Avatar.svelte';

	let {
		jobId,
		tasks,
		canManage
	}: {
		jobId: string;
		tasks: JobTaskRow[];
		// Edit access to the job (same gate as time entries) — lets this member add, tick, edit,
		// reorder and delete checklist tasks.
		canManage: boolean;
	} = $props();

	const total = $derived(tasks.length);
	const doneCount = $derived(tasks.filter((t) => t.completed).length);
	const progressPct = $derived(total > 0 ? Math.round((doneCount / total) * 100) : 0);

	// Assignee options — fetched lazily the first time the crew opens the add/edit form. Gated to
	// the contacts-assignee endpoint; a member without that access just gets an empty list and the
	// assignee picker stays disabled (they can still add + tick tasks).
	let members = $state<{ id: string; full_name: string }[]>([]);
	let membersLoaded = $state(false);
	async function ensureMembers() {
		if (membersLoaded) return;
		membersLoaded = true;
		try {
			const r = await fetch('/api/contacts/assignees');
			if (r.ok) {
				const a = (await r.json()) as { assignees: { id: string; full_name: string }[] };
				members = a.assignees;
			}
		} catch {
			// leave the picker empty — non-fatal
		}
	}

	// Due-date helpers — due_date is a plain 'YYYY-MM-DD' calendar day (no time zone). Parse it in
	// local time and compare against today's date only.
	function parseDay(d: string): Date {
		const [y, m, day] = d.split('-').map(Number);
		return new Date(y, m - 1, day);
	}
	function todayStart(): Date {
		const n = new Date();
		return new Date(n.getFullYear(), n.getMonth(), n.getDate());
	}
	function dueLabel(d: string): string {
		const due = parseDay(d);
		const today = todayStart();
		const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
		if (diffDays === 0) return 'Due today';
		if (diffDays === 1) return 'Due tomorrow';
		if (diffDays === -1) return 'Due yesterday';
		if (diffDays < 0)
			return `Overdue · ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
		if (diffDays < 7) return `Due ${due.toLocaleDateString(undefined, { weekday: 'short' })}`;
		return `Due ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
	}
	function isOverdue(t: JobTaskRow): boolean {
		return !t.completed && t.due_date != null && parseDay(t.due_date) < todayStart();
	}

	function applyResult(data: { tasks: JobTaskRow[] }) {
		jobDetailStore.patch(jobId, (prev) => ({ ...prev, tasks: data.tasks }));
	}

	// ── Toggle done ──────────────────────────────────────────────────────────────
	// Optimistic: flip the tick in the store immediately so the UI feels instant, then confirm
	// with the server (which also fills in completed_by / completed_at). Revert on any failure.
	let togglingId = $state<string | null>(null);
	function setCompleted(taskId: string, value: boolean) {
		jobDetailStore.patch(jobId, (prev) => ({
			...prev,
			tasks: prev.tasks.map((x) => (x.id === taskId ? { ...x, completed: value } : x))
		}));
	}
	async function toggle(t: JobTaskRow) {
		if (!canManage || togglingId === t.id) return;
		const next = !t.completed;
		togglingId = t.id;
		setCompleted(t.id, next); // optimistic flip
		try {
			const res = await fetch(`/api/jobs/${jobId}/tasks/${t.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ completed: next })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				setCompleted(t.id, !next); // revert
				toast.error(body.error ?? 'Could not update task.');
				return;
			}
			applyResult(body.data); // authoritative (completed_by_name, completed_at)
		} catch {
			setCompleted(t.id, !next); // revert
			toast.error('Network error. Try again.');
		} finally {
			togglingId = null;
		}
	}

	// ── Add / edit form ──────────────────────────────────────────────────────────
	let formOpen = $state(false);
	let editingId = $state<string | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);
	let fTitle = $state('');
	let fAssignee = $state('');
	let fDueDate = $state('');

	function openAdd() {
		editingId = null;
		fTitle = '';
		fAssignee = '';
		fDueDate = '';
		formError = null;
		formOpen = true;
		void ensureMembers();
	}

	function openEdit(t: JobTaskRow) {
		editingId = t.id;
		fTitle = t.title;
		fAssignee = t.assigned_to ?? '';
		fDueDate = t.due_date ?? '';
		formError = null;
		formOpen = true;
		void ensureMembers();
	}

	function closeForm() {
		formOpen = false;
		editingId = null;
		formError = null;
	}

	async function save() {
		if (!fTitle.trim()) {
			formError = 'Enter a task.';
			return;
		}
		saving = true;
		formError = null;
		try {
			const url = editingId ? `/api/jobs/${jobId}/tasks/${editingId}` : `/api/jobs/${jobId}/tasks`;
			const res = await fetch(url, {
				method: editingId ? 'PATCH' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: fTitle.trim(),
					assigned_to: fAssignee || null,
					due_date: fDueDate || null
				})
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				formError = body.error ?? 'Could not save task.';
				return;
			}
			applyResult(body.data);
			closeForm();
		} catch {
			formError = 'Network error. Try again.';
		} finally {
			saving = false;
		}
	}

	let deletingId = $state<string | null>(null);
	async function remove(t: JobTaskRow) {
		if (!confirm('Delete this task?')) return;
		deletingId = t.id;
		try {
			const res = await fetch(`/api/jobs/${jobId}/tasks/${t.id}`, { method: 'DELETE' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not delete task.');
				return;
			}
			applyResult(body.data);
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			deletingId = null;
		}
	}

	const hasTasks = $derived(total > 0);
</script>

<section class="job-section job-tasks">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="ri-checkbox-multiple-line job-section__icon" aria-hidden="true"></i>
			<h2 class="job-section__title">Tasks</h2>
		</div>
		{#if hasTasks}
			<span class="job-tasks__count">{doneCount} / {total} done</span>
		{/if}
	</div>

	{#if hasTasks}
		<div class="job-tasks__progress" role="presentation">
			<div class="job-tasks__progress-bar" style="width: {progressPct}%"></div>
		</div>
	{/if}

	{#if !hasTasks && !formOpen}
		<p class="job-tasks__empty">No tasks yet. Add a checklist the crew can tick off on site.</p>
	{/if}

	<ul class="job-tasks__list">
		{#each tasks as t (t.id)}
			<li
				class="job-tasks__item"
				class:job-tasks__item--done={t.completed}
				class:job-tasks__item--editing={editingId === t.id}
			>
				<button
					type="button"
					class="job-tasks__check"
					class:job-tasks__check--on={t.completed}
					aria-label={t.completed ? 'Mark task not done' : 'Mark task done'}
					aria-pressed={t.completed}
					disabled={!canManage || togglingId === t.id}
					onclick={() => toggle(t)}
				>
					<i
						class={t.completed ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'}
						aria-hidden="true"
					></i>
				</button>

				<div class="job-tasks__body">
					<p class="job-tasks__title">{t.title}</p>
					<div class="job-tasks__meta">
						{#if t.assignee_name}
							<span class="job-tasks__assignee">
								<Avatar size="sm" name={t.assignee_name} />
								{t.assignee_name}
							</span>
						{/if}
						{#if t.due_date}
							<span class="job-tasks__due" class:job-tasks__due--overdue={isOverdue(t)}>
								<i class="ri-calendar-line" aria-hidden="true"></i>
								{dueLabel(t.due_date)}
							</span>
						{/if}
						{#if t.completed && t.completed_by_name}
							<span class="job-tasks__done-by">by {t.completed_by_name}</span>
						{/if}
					</div>
				</div>

				{#if canManage}
					<div class="job-tasks__actions">
						<button
							type="button"
							class="job-tasks__icon-btn"
							aria-label="Edit task"
							onclick={() => openEdit(t)}
						>
							<i class="ri-pencil-line" aria-hidden="true"></i>
						</button>
						<button
							type="button"
							class="job-tasks__icon-btn job-tasks__icon-btn--danger"
							aria-label="Delete task"
							disabled={deletingId === t.id}
							onclick={() => remove(t)}
						>
							{#if deletingId === t.id}
								<i class="ri-loader-4-line job-section__spin" aria-hidden="true"></i>
							{:else}
								<i class="ri-delete-bin-line" aria-hidden="true"></i>
							{/if}
						</button>
					</div>
				{/if}
			</li>
		{/each}
	</ul>

	{#if formOpen}
		<div class="job-tasks__form">
			<div class="field">
				<label class="field__label" for="task-title">Task</label>
				<input
					id="task-title"
					class="field__input"
					type="text"
					bind:value={fTitle}
					placeholder="e.g. Pull permit, haul away debris"
					maxlength="300"
				/>
			</div>
			<div class="job-tasks__form-grid">
				<div class="field">
					<label class="field__label" for="task-assignee">Assign to (optional)</label>
					<select
						id="task-assignee"
						class="field__input"
						bind:value={fAssignee}
						disabled={members.length === 0}
					>
						<option value="">Unassigned</option>
						{#each members as m (m.id)}
							<option value={m.id}>{m.full_name}</option>
						{/each}
					</select>
				</div>
				<div class="field">
					<label class="field__label" for="task-due">Due date (optional)</label>
					<input id="task-due" class="field__input" type="date" bind:value={fDueDate} />
				</div>
			</div>

			{#if formError}
				<p class="job-tasks__form-error" role="alert">{formError}</p>
			{/if}

			<div class="job-tasks__form-actions">
				<Button variant="ghost" size="sm" onclick={closeForm} disabled={saving}>Cancel</Button>
				<Button size="sm" loading={saving} onclick={save}>
					{editingId ? 'Save task' : 'Add task'}
				</Button>
			</div>
		</div>
	{:else if canManage}
		<button type="button" class="job-tasks__add" onclick={openAdd}>
			<i class="ri-add-line" aria-hidden="true"></i>
			Add task
		</button>
	{/if}
</section>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.job-tasks {
		&__count {
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-secondary);
		}

		&__progress {
			height: 6px;
			border-radius: $radius-full;
			background: var(--color-bg-surface-sunk);
			overflow: hidden;
			margin-bottom: $space-4;
		}

		&__progress-bar {
			height: 100%;
			border-radius: $radius-full;
			background: var(--color-brand);
			transition: width $duration-base $ease-standard;
		}

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
			display: flex;
			align-items: flex-start;
			gap: $space-3;
			padding: $space-3 0;
			border-bottom: 1px solid var(--color-border);

			&--editing {
				opacity: 0.5;
			}
		}

		&__check {
			flex-shrink: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			width: 26px;
			height: 26px;
			padding: 0;
			border: none;
			background: transparent;
			color: var(--color-text-muted);
			cursor: pointer;
			transition: color $duration-fast $ease-standard;

			i {
				font-size: 1.3rem;
			}

			&:hover:not(:disabled) {
				color: var(--color-brand);
			}

			&--on {
				color: var(--color-brand);
			}

			&:disabled {
				cursor: default;
			}
		}

		&__body {
			flex: 1;
			min-width: 0;
		}

		&__title {
			margin: 2px 0 0;
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
			word-break: break-word;
		}

		&__item--done &__title {
			text-decoration: line-through;
			color: var(--color-text-muted);
		}

		&__meta {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: $space-2 $space-3;
			margin-top: $space-1;
		}

		&__assignee {
			display: inline-flex;
			align-items: center;
			gap: $space-2;
			font-size: $fs-body;
			color: var(--color-text-secondary);
		}

		&__due {
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			font-size: $fs-body;
			color: var(--color-text-muted);

			&--overdue {
				color: var(--danger-text);
				font-weight: $weight-semibold;
			}
		}

		&__done-by {
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__actions {
			display: flex;
			gap: $space-1;
			flex-shrink: 0;
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

		&__add {
			display: inline-flex;
			align-items: center;
			gap: $space-2;
			margin-top: $space-3;
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

		&__form {
			margin-top: $space-4;
			padding: $space-4;
			border: 1px solid var(--color-border-strong);
			border-radius: $radius-lg;
			background: var(--color-bg-surface-sunk);
			display: flex;
			flex-direction: column;
			gap: $space-3;
		}

		&__form-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: $space-3;
		}

		&__form-error {
			margin: 0;
			font-size: $fs-body;
			font-weight: 600;
			color: var(--danger-text);
		}

		&__form-actions {
			display: flex;
			justify-content: flex-end;
			gap: $space-2;
		}
	}

	@media (max-width: 560px) {
		.job-tasks__form-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
