<script lang="ts">
	import { formatCurrency, formatDateTime } from '$lib/utils/format';
	import { toast } from '$lib/stores/toast.svelte';
	import { jobDetailStore } from '$lib/stores/jobDetail.svelte';
	import { getMemberContext } from '$lib/context/member';
	import type { JobCosting, JobTimeEntryRow } from '$lib/types/jobs';
	import { Button } from '$lib/components/ui/button';

	let {
		jobId,
		entries,
		canManage,
		canViewCost
	}: {
		jobId: string;
		entries: JobTimeEntryRow[];
		// Edit access to the job (same gate as expenses) — lets this member start/stop their own
		// timer and log/edit their own manual entries.
		canManage: boolean;
		// Whether hourly cost / total labor $ should render — mirrors the Job Costing panel's
		// own gate (can_view_revenue). Hours worked are shown either way.
		canViewCost: boolean;
	} = $props();

	const member = getMemberContext();
	const myId = $derived(member().id);
	const canManageAny = $derived(member().can_view_full_pipeline);

	const myRunningEntry = $derived(entries.find((e) => e.org_member_id === myId && !e.clock_out));
	const isTimerRunning = $derived(!!myRunningEntry);

	function totalMinutes(): number {
		let total = 0;
		for (const e of entries) {
			if (e.duration_minutes != null) total += Number(e.duration_minutes);
		}
		return total;
	}
	const totalHoursLabel = $derived(formatDuration(totalMinutes()));

	const totalLaborCost = $derived.by(() => {
		let total = 0;
		for (const e of entries) {
			if (e.cost_amount != null) total += Number(e.cost_amount);
		}
		return total;
	});

	function formatDuration(minutes: number): string {
		if (minutes <= 0) return '0m';
		const h = Math.floor(minutes / 60);
		const m = Math.round(minutes % 60);
		if (h === 0) return `${m}m`;
		if (m === 0) return `${h}h`;
		return `${h}h ${m}m`;
	}

	// Live elapsed-time tick for the running timer, so it counts up without a refetch.
	let nowTick = $state(Date.now());
	let tickHandle: ReturnType<typeof setInterval> | null = null;
	$effect(() => {
		if (isTimerRunning && !tickHandle) {
			tickHandle = setInterval(() => (nowTick = Date.now()), 1000);
		} else if (!isTimerRunning && tickHandle) {
			clearInterval(tickHandle);
			tickHandle = null;
		}
		return () => {
			if (tickHandle) {
				clearInterval(tickHandle);
				tickHandle = null;
			}
		};
	});
	const liveElapsedLabel = $derived.by(() => {
		if (!myRunningEntry) return '';
		const startMs = new Date(myRunningEntry.clock_in).getTime();
		const elapsedMin = Math.max(0, (nowTick - startMs) / 60000);
		return formatDuration(elapsedMin);
	});

	function applyResult(data: { time_entries: JobTimeEntryRow[]; costing: JobCosting | null }) {
		jobDetailStore.patch(jobId, (prev) => ({
			...prev,
			time_entries: data.time_entries,
			costing: data.costing ?? prev.costing
		}));
	}

	let starting = $state(false);
	async function startTimer() {
		starting = true;
		try {
			const res = await fetch(`/api/jobs/${jobId}/time-entries`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({})
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not start timer.');
				return;
			}
			applyResult(body.data);
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			starting = false;
		}
	}

	let stopping = $state(false);
	async function stopTimer() {
		if (!myRunningEntry) return;
		stopping = true;
		try {
			const res = await fetch(`/api/jobs/${jobId}/time-entries/${myRunningEntry.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ clock_out: new Date().toISOString() })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not stop timer.');
				return;
			}
			applyResult(body.data);
			toast.success('Timer stopped');
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			stopping = false;
		}
	}

	// ── Manual add / edit form ───────────────────────────────────────────────────
	function toInputValue(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}
	function nowInputValue(): string {
		return toInputValue(new Date().toISOString());
	}

	let formOpen = $state(false);
	let editingId = $state<string | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);
	let fClockIn = $state('');
	let fClockOut = $state('');
	let fNotes = $state('');

	function openAdd() {
		editingId = null;
		fClockIn = nowInputValue();
		fClockOut = nowInputValue();
		fNotes = '';
		formError = null;
		formOpen = true;
	}

	function openEdit(e: JobTimeEntryRow) {
		editingId = e.id;
		fClockIn = toInputValue(e.clock_in);
		fClockOut = toInputValue(e.clock_out);
		fNotes = e.notes ?? '';
		formError = null;
		formOpen = true;
	}

	function closeForm() {
		formOpen = false;
		editingId = null;
		formError = null;
	}

	async function save() {
		if (!fClockIn || !fClockOut) {
			formError = 'Enter both a start and end time.';
			return;
		}
		const start = new Date(fClockIn);
		const end = new Date(fClockOut);
		if (end <= start) {
			formError = 'End time must be after start time.';
			return;
		}
		saving = true;
		formError = null;
		try {
			const url = editingId
				? `/api/jobs/${jobId}/time-entries/${editingId}`
				: `/api/jobs/${jobId}/time-entries`;
			const res = await fetch(url, {
				method: editingId ? 'PATCH' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					clock_in: start.toISOString(),
					clock_out: end.toISOString(),
					notes: fNotes.trim() || null
				})
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				formError = body.error ?? 'Could not save time entry.';
				return;
			}
			applyResult(body.data);
			toast.success(editingId ? 'Time entry updated' : 'Time entry added');
			closeForm();
		} catch {
			formError = 'Network error. Try again.';
		} finally {
			saving = false;
		}
	}

	let deletingId = $state<string | null>(null);
	async function remove(e: JobTimeEntryRow) {
		if (!confirm("Delete this time entry? This can't be undone from here.")) return;
		deletingId = e.id;
		try {
			const res = await fetch(`/api/jobs/${jobId}/time-entries/${e.id}`, { method: 'DELETE' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not delete time entry.');
				return;
			}
			applyResult(body.data);
			toast.success('Time entry deleted');
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			deletingId = null;
		}
	}

	function canTouch(e: JobTimeEntryRow): boolean {
		return canManageAny || (canManage && e.org_member_id === myId);
	}

	const hasEntries = $derived(entries.length > 0);
</script>

<section class="job-section job-timetrack">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="ri-time-line job-section__icon" aria-hidden="true"></i>
			<h2 class="job-section__title">Time tracking</h2>
		</div>
		{#if hasEntries}
			<span class="job-timetrack__total">
				{totalHoursLabel}
				{#if canViewCost && totalLaborCost > 0}
					<span class="job-timetrack__total-cost">· {formatCurrency(totalLaborCost)}</span>
				{/if}
			</span>
		{/if}
	</div>

	{#if canManage}
		<div class="job-timetrack__actions">
			{#if isTimerRunning}
				<button
					type="button"
					class="btn btn--sm btn--danger-outline job-timetrack__timer-btn"
					onclick={stopTimer}
					disabled={stopping}
				>
					{#if stopping}
						<i class="ri-loader-4-line job-section__spin" aria-hidden="true"></i>
					{:else}
						<i class="ri-stop-circle-line" aria-hidden="true"></i>
					{/if}
					Stop timer · {liveElapsedLabel}
				</button>
			{:else}
				<button
					type="button"
					class="btn btn--sm btn--primary job-timetrack__timer-btn"
					onclick={startTimer}
					disabled={starting}
				>
					{#if starting}
						<i class="ri-loader-4-line job-section__spin" aria-hidden="true"></i>
					{:else}
						<i class="ri-play-circle-line" aria-hidden="true"></i>
					{/if}
					Start timer
				</button>
			{/if}
			{#if !formOpen}
				<Button variant="secondary" size="sm" onclick={openAdd}>
					<i class="ri-add-line" aria-hidden="true"></i>
					Log time
				</Button>
			{/if}
		</div>
	{/if}

	{#if !hasEntries && !formOpen}
		<p class="job-timetrack__empty">No time logged yet. Start the timer or log hours by hand.</p>
	{/if}

	{#each entries as e (e.id)}
		<div class="job-timetrack__entry" class:job-timetrack__entry--editing={editingId === e.id}>
			<div class="job-timetrack__entry-avatar">
				{e.member_name
					.split(' ')
					.map((p) => p[0] ?? '')
					.slice(0, 2)
					.join('')
					.toUpperCase()}
			</div>
			<div class="job-timetrack__entry-main">
				<p class="job-timetrack__entry-name">
					{e.member_name}
					{#if !e.clock_out}
						<span class="job-timetrack__live-badge">Running</span>
					{/if}
				</p>
				<p class="job-timetrack__entry-meta">
					{formatDateTime(e.clock_in)}{e.clock_out ? ` – ${formatDateTime(e.clock_out)}` : ''}
				</p>
				{#if e.notes}
					<p class="job-timetrack__entry-notes">{e.notes}</p>
				{/if}
			</div>
			<div class="job-timetrack__entry-duration">
				{#if e.duration_minutes != null}
					<span class="job-timetrack__entry-hours"
						>{formatDuration(Number(e.duration_minutes))}</span
					>
					{#if canViewCost && e.cost_amount != null}
						<span class="job-timetrack__entry-cost">{formatCurrency(e.cost_amount)}</span>
					{/if}
				{/if}
			</div>
			{#if canTouch(e)}
				<div class="job-timetrack__entry-actions">
					{#if e.clock_out}
						<button
							type="button"
							class="job-timetrack__icon-btn"
							aria-label="Edit time entry"
							onclick={() => openEdit(e)}
						>
							<i class="ri-pencil-line" aria-hidden="true"></i>
						</button>
					{/if}
					<button
						type="button"
						class="job-timetrack__icon-btn job-timetrack__icon-btn--danger"
						aria-label="Delete time entry"
						disabled={deletingId === e.id}
						onclick={() => remove(e)}
					>
						{#if deletingId === e.id}
							<i class="ri-loader-4-line job-section__spin" aria-hidden="true"></i>
						{:else}
							<i class="ri-delete-bin-line" aria-hidden="true"></i>
						{/if}
					</button>
				</div>
			{/if}
		</div>
	{/each}

	{#if formOpen}
		<div class="job-timetrack__form">
			<div class="job-timetrack__form-grid">
				<div class="field">
					<label class="field__label" for="te-clock-in">Start</label>
					<input
						id="te-clock-in"
						class="field__input"
						type="datetime-local"
						bind:value={fClockIn}
					/>
				</div>
				<div class="field">
					<label class="field__label" for="te-clock-out">End</label>
					<input
						id="te-clock-out"
						class="field__input"
						type="datetime-local"
						bind:value={fClockOut}
					/>
				</div>
			</div>
			<div class="field">
				<label class="field__label" for="te-notes">Notes (optional)</label>
				<textarea
					id="te-notes"
					class="job-timetrack__textarea"
					bind:value={fNotes}
					rows="2"
					placeholder="What was done during this time"
				></textarea>
			</div>

			{#if formError}
				<p class="job-timetrack__form-error" role="alert">{formError}</p>
			{/if}

			<div class="job-timetrack__form-actions">
				<Button variant="ghost" size="sm" onclick={closeForm} disabled={saving}>Cancel</Button>
				<Button size="sm" loading={saving} onclick={save}>
					{editingId ? 'Save entry' : 'Add entry'}
				</Button>
			</div>
		</div>
	{/if}
</section>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.job-timetrack {
		&__total {
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-secondary);
		}

		&__total-cost {
			color: var(--color-text-muted);
			font-weight: $weight-medium;
		}

		&__actions {
			display: flex;
			gap: $space-2;
			margin-bottom: $space-4;
		}

		&__timer-btn {
			i {
				font-size: 1.1rem;
			}
		}

		&__empty {
			font-size: $fs-body;
			color: var(--color-text-muted);
			font-style: italic;
		}

		&__entry {
			display: flex;
			align-items: center;
			gap: $space-3;
			padding: $space-3 0;
			border-bottom: 1px solid var(--color-border);

			&--editing {
				opacity: 0.5;
			}
		}

		&__entry-avatar {
			flex-shrink: 0;
			width: 34px;
			height: 34px;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: $radius-full;
			background: var(--color-bg-surface-sunk);
			color: var(--color-text-secondary);
			font-size: $fs-body;
			font-weight: $weight-semibold;
		}

		&__entry-main {
			flex: 1;
			min-width: 0;
		}

		&__entry-name {
			margin: 0;
			display: flex;
			align-items: center;
			gap: $space-2;
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
		}

		&__live-badge {
			display: inline-flex;
			align-items: center;
			padding: 1px $space-2;
			border-radius: $radius-full;
			background: var(--success-bg);
			color: var(--success-text);
			font-size: $fs-caption;
			font-weight: $weight-semibold;
			text-transform: uppercase;
			letter-spacing: $tracking-label;
		}

		&__entry-meta {
			margin: 2px 0 0;
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__entry-notes {
			margin: $space-1 0 0;
			font-size: $fs-body;
			color: var(--color-text-secondary);
		}

		&__entry-duration {
			flex-shrink: 0;
			display: flex;
			flex-direction: column;
			align-items: flex-end;
			gap: 2px;
		}

		&__entry-hours {
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
		}

		&__entry-cost {
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__entry-actions {
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

		&__textarea {
			width: 100%;
			padding: $space-3 $space-4;
			border-radius: $radius-md;
			border: 1px solid var(--color-border-strong);
			background: var(--color-bg-surface);
			font: inherit;
			font-size: $fs-body;
			color: var(--color-text-primary);
			resize: vertical;

			&:focus {
				outline: none;
				border-color: var(--color-brand);
				box-shadow: var(--shadow-focus);
			}
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
		.job-timetrack__form-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
