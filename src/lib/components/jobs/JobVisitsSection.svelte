<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import AppointmentStatusBadge from '$lib/components/appointments/AppointmentStatusBadge.svelte';
	import RowActionsMenu from '$lib/components/shared/RowActionsMenu.svelte';
	import SectionEditButton from '$lib/components/shared/SectionEditButton.svelte';
	import JobVisitPhotos from './JobVisitPhotos.svelte';
	import VisitScheduleModal, { type VisitJobInfo } from './VisitScheduleModal.svelte';
	import VisitDetailModal from './VisitDetailModal.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { formatDateInOrgTz, formatTimeInOrgTz } from '$lib/utils/formatInOrgTz';
	import { summarizeRecurrence, type JobRecurrence } from '$lib/jobs/recurrence';
	import type {
		JobVisitRow,
		JobVisitPhoto,
		JobVisitStatus,
		AppointmentStatusJobEcho
	} from '$lib/types/jobs';

	// This is the job's single "Schedule" section (Session 3.3): the standalone Start/End/Assigned
	// summary card was folded in here, since the per-visit list already carries those facts. The
	// header shows the recurrence summary + "Recurring" badge and an "Edit all visits" button that
	// opens the job-level schedule editor (recurrence-aware) on the parent page.
	//
	// `reloadKey` is bumped by the parent page after a save/status change so this list re-fetches.
	// `onChanged` lets us bump that same version after any mutation, so the activity timeline
	// (which also keys off reloadKey) refreshes too. `jobInfo` feeds the shared schedule modal.
	let {
		jobId,
		jobInfo,
		canManage = false,
		reloadKey = 0,
		recurrence = null,
		appointmentCount = 0,
		scheduledStart = null,
		scheduledEnd = null,
		scheduleAsNeeded = false,
		onEditAll,
		onChanged
	}: {
		jobId: string;
		jobInfo: VisitJobInfo;
		canManage?: boolean;
		reloadKey?: number;
		recurrence?: JobRecurrence | null;
		appointmentCount?: number;
		// Job-level schedule WINDOW (Jobber "As needed"): the job stores a start date + an end
		// boundary but materializes NO visits. Surfaced in the summary so the dates the contractor
		// picked are still visible even though the visit list is empty by design.
		scheduledStart?: string | null;
		scheduledEnd?: string | null;
		scheduleAsNeeded?: boolean;
		// When provided, an "Edit all visits" button opens the job-level schedule editor.
		onEditAll?: () => void;
		onChanged?: (job?: AppointmentStatusJobEcho) => void;
	} = $props();

	const orgTz = $derived(sessionStore.data?.org.timezone);

	let visits = $state<JobVisitRow[]>([]);
	let loading = $state(true);
	let refreshing = $state(false);
	let hasLoaded = false;
	let errorMsg = $state<string | null>(null);

	let fetchToken = 0;
	$effect(() => {
		void [jobId, reloadKey];
		const token = ++fetchToken;
		if (hasLoaded) refreshing = true;
		else loading = true;
		errorMsg = null;
		(async () => {
			try {
				const res = await fetch(`/api/jobs/${jobId}/visits`);
				if (token !== fetchToken) return;
				if (!res.ok) {
					errorMsg = 'Failed to load visits.';
					return;
				}
				const body = (await res.json()) as { data: { visits: JobVisitRow[] } };
				if (token !== fetchToken) return;
				visits = body.data.visits;
				hasLoaded = true;
			} catch {
				if (token === fetchToken) errorMsg = 'Failed to load visits.';
			} finally {
				if (token === fetchToken) {
					loading = false;
					refreshing = false;
				}
			}
		})();
	});

	// ── Three Jobber buckets ────────────────────────────────────────────────────────
	// To be scheduled = date-less placeholders; Upcoming = dated & still open; Past =
	// completed / cancelled / no-show (most-recent first). The loader returns rows with
	// unscheduled ones first (NULL start), then dated ascending.
	const toBeScheduled = $derived(visits.filter((v) => v.status === 'unscheduled'));
	const upcoming = $derived(visits.filter((v) => v.status === 'scheduled'));
	const past = $derived(
		visits
			.filter((v) => v.status === 'completed' || v.status === 'cancelled' || v.status === 'no_show')
			.slice()
			.reverse()
	);

	// ── Schedule summary range (Start date → End date) ───────────────────────────────
	// The card summarizes the job's span: Start = the FIRST visit's date, End = the LAST
	// visit's date (Jobber). All dated visits, ascending — the loader lists unscheduled
	// (NULL start) first then dated ascending, so we filter + sort defensively.
	const datedVisits = $derived(
		visits
			.filter((v) => v.scheduled_start)
			.slice()
			.sort((a, b) => (a.scheduled_start! < b.scheduled_start! ? -1 : 1))
	);

	// The "Start – End" label shown on the summary card. Prefers the real visit span; falls
	// back to the job-level stored window when the job has NO visits (Jobber "As needed", which
	// keeps a start/end but generates no visits). Collapses to a single date when start = end.
	const scheduleRange = $derived.by(() => {
		let startISO: string | null = null;
		let endISO: string | null = null;
		if (datedVisits.length > 0) {
			startISO = datedVisits[0].scheduled_start;
			endISO = datedVisits[datedVisits.length - 1].scheduled_start;
		} else if (scheduledStart) {
			startISO = scheduledStart;
			endISO = scheduledEnd ?? scheduledStart;
		}
		if (!startISO) return null;
		const start = formatDateInOrgTz(startISO, orgTz);
		const end = formatDateInOrgTz(endISO ?? startISO, orgTz);
		return start === end ? start : `${start} – ${end}`;
	});

	type StatusFilter = 'all' | 'unscheduled' | 'scheduled' | 'completed';
	let statusFilter = $state<StatusFilter>('all');
	const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'scheduled', label: 'Scheduled' },
		{ value: 'unscheduled', label: 'Unscheduled' },
		{ value: 'completed', label: 'Completed' }
	];
	const statusFilterLabel = $derived(
		STATUS_FILTERS.find((f) => f.value === statusFilter)?.label ?? 'All'
	);
	const showToBeScheduled = $derived(statusFilter === 'all' || statusFilter === 'unscheduled');
	const showUpcoming = $derived(statusFilter === 'all' || statusFilter === 'scheduled');
	const showPast = $derived(statusFilter === 'all' || statusFilter === 'completed');
	const anyVisible = $derived(
		(showToBeScheduled && toBeScheduled.length > 0) ||
			(showUpcoming && upcoming.length > 0) ||
			(showPast && past.length > 0)
	);

	function dateLabel(v: JobVisitRow): string {
		if (!v.scheduled_start) return 'Unscheduled';
		const d = formatDateInOrgTz(v.scheduled_start, orgTz);
		const start = formatTimeInOrgTz(v.scheduled_start, orgTz);
		const end = v.scheduled_end ? formatTimeInOrgTz(v.scheduled_end, orgTz) : null;
		return end ? `${d} · ${start} – ${end}` : `${d} · ${start}`;
	}

	function completedLabel(v: JobVisitRow): string {
		if (!v.completed_at) return '';
		const when = formatDateInOrgTz(v.completed_at, orgTz);
		return v.completed_by_name
			? `Completed ${when} by ${v.completed_by_name}`
			: `Completed ${when}`;
	}

	function patchVisitPhotos(visitId: string, mutate: (p: JobVisitPhoto[]) => JobVisitPhoto[]) {
		visits = visits.map((v) => (v.id === visitId ? { ...v, photos: mutate(v.photos) } : v));
	}

	// ── Shared "Schedule a visit" modal (create / edit) ─────────────────────────────
	let modalOpen = $state(false);
	let modalMode = $state<'create' | 'edit'>('create');
	let modalVisit = $state<JobVisitRow | null>(null);

	function openCreate() {
		modalMode = 'create';
		modalVisit = null;
		modalOpen = true;
	}
	function openEdit(v: JobVisitRow) {
		modalMode = 'edit';
		modalVisit = v;
		modalOpen = true;
	}

	// ── Visit Details modal (row click) ─────────────────────────────────────────────
	// Keyed by id (not a snapshot) so the modal's notes/photos stay live as `visits` mutates.
	let detailOpen = $state(false);
	let detailVisitId = $state<string | null>(null);
	const detailVisit = $derived(visits.find((v) => v.id === detailVisitId) ?? null);

	function openDetail(v: JobVisitRow) {
		detailVisitId = v.id;
		detailOpen = true;
	}

	// From the detail modal's Mark Complete — close it, then run the shared completeVisit so the
	// last-visit "Final visit completed" popup still fires from this component.
	function completeFromDetail(v: JobVisitRow) {
		void completeVisit(v);
	}

	function patchVisitNotes(visitId: string, notes: string | null) {
		visits = visits.map((v) => (v.id === visitId ? { ...v, completion_notes: notes } : v));
	}

	// ── Complete a visit (Jobber: one tap for any visit type) ────────────────────────
	// The tick on ANY visit — dated OR unscheduled placeholder — runs the same flow:
	// show a per-row spinner, mark it complete, then (only if it was the LAST open visit)
	// raise the "Final visit completed" popup. `busyId` drives the spinner and
	// blocks a double-tap on any row — for BOTH the "Complete visit" tick and the
	// "Mark as incomplete" action.
	let busyId = $state<string | null>(null);

	async function transitionStatus(
		id: string,
		status: 'completed' | 'incomplete',
		completionNotes?: string | null
	): Promise<{ ok: boolean; job: AppointmentStatusJobEcho }> {
		const res = await fetch(`/api/appointments/${id}/status`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status, completion_notes: completionNotes ?? null })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			toast.error(body.error ?? 'Could not update the visit.');
			return { ok: false, job: null };
		}
		const body = (await res.json()) as {
			data: {
				id: string;
				status: JobVisitStatus;
				job: AppointmentStatusJobEcho;
			};
		};
		// Reflect the server-authoritative status locally right away so the row moves to
		// its new bucket (e.g. Upcoming → Past) on the spot instead of waiting for a refetch.
		visits = visits.map((v) => (v.id === id ? { ...v, status: body.data.status } : v));
		return { ok: true, job: body.data.job ?? null };
	}

	// The "Final visit completed" popup (Jobber ref/2) — shown only after the LAST open
	// visit is completed. `finalVisit` is that just-completed visit; the popup's choices
	// act on the job, not on the (already-done) visit.
	let finalVisit = $state<JobVisitRow | null>(null);
	let finalBusy = $state(false);

	function closeFinalPopup() {
		if (finalBusy) return;
		finalVisit = null;
	}

	// The tick on ANY visit (dated or unscheduled placeholder). Marks it complete with a
	// per-row spinner, then — ONLY when it was the last still-open visit on the job — raises
	// the follow-up popup. When other visits remain, completion is silent (toast only),
	// matching Jobber's "prompt to close only on the last visit" behaviour.
	async function completeVisit(v: JobVisitRow) {
		if (busyId) return;
		// Open = still schedulable/doable: a dated 'scheduled' visit OR a dateless
		// 'unscheduled' placeholder. v itself is open, so <= 1 means it's the only one left.
		const openCount = visits.filter(
			(x) => x.status === 'scheduled' || x.status === 'unscheduled'
		).length;
		const wasLast = openCount <= 1;
		busyId = v.id;
		try {
			const { ok, job } = await transitionStatus(v.id, 'completed');
			if (!ok) return;
			onChanged?.(job);
			if (wasLast) {
				finalVisit = v;
				finalBusy = false;
			} else {
				toast.success('Visit completed');
			}
		} finally {
			busyId = null;
		}
	}

	// Popup choices act on the ALREADY-completed final visit. Close = mark the job done;
	// Schedule = book a follow-up visit; Leave = dismiss (job stays open / action-required).
	async function finalAction(kind: 'close' | 'schedule' | 'leave') {
		if (finalBusy) return;
		if (kind === 'close') {
			finalBusy = true;
			try {
				const res = await fetch(`/api/jobs/${jobId}/status`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ status: 'completed' })
				});
				if (!res.ok) {
					const body = await res.json().catch(() => ({}));
					toast.error(body.error ?? 'Could not close the job.');
					return;
				}
				toast.success('Job closed');
				finalVisit = null;
				onChanged?.();
			} finally {
				finalBusy = false;
			}
			return;
		}
		// schedule / leave are instant — close the popup, and for schedule open the create modal.
		finalVisit = null;
		if (kind === 'schedule') openCreate();
	}

	// ── Mark a completed visit back to incomplete ────────────────────────────────────
	// Shows a per-row spinner (via `busyId`) so the user sees the in-flight operation,
	// matching the "Complete visit" button feedback.
	async function markIncomplete(v: JobVisitRow) {
		if (busyId) return;
		busyId = v.id;
		try {
			const { ok, job } = await transitionStatus(v.id, 'incomplete');
			if (!ok) return;
			toast.success('Visit marked incomplete');
			onChanged?.(job);
		} finally {
			busyId = null;
		}
	}

	const STATUS_LABEL: Record<JobVisitStatus, string> = {
		scheduled: 'Scheduled',
		unscheduled: 'Unscheduled',
		completed: 'Completed',
		cancelled: 'Cancelled',
		no_show: 'No-show'
	};
</script>

<section class="job-section job-visits">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="ri-calendar-check-line job-section__icon" aria-hidden="true"></i>
			<h2 class="job-section__title">Schedule</h2>
			{#if recurrence}
				<span class="badge badge--brand">
					<i class="ri-repeat-line" aria-hidden="true"></i> Recurring
				</span>
			{:else if scheduleAsNeeded}
				<span class="badge badge--neutral">
					<i class="ri-calendar-todo-line" aria-hidden="true"></i> As needed
				</span>
			{/if}
		</div>
		<div class="job-visits__head-actions">
			{#if refreshing}
				<span class="job-visits__refreshing">
					<i class="ri-loader-4-line job-section__spin" aria-hidden="true"></i>
					Updating…
				</span>
			{/if}
			{#if onEditAll}
				<SectionEditButton onclick={onEditAll} label="Edit all visits" />
			{/if}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger class="job-visits__filter">
					<span class="job-visits__filter-key">Status</span>
					<span class="job-visits__filter-sep" aria-hidden="true"></span>
					<span class="job-visits__filter-val">{statusFilterLabel}</span>
					<i class="ri-arrow-down-s-line" aria-hidden="true"></i>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					{#each STATUS_FILTERS as f (f.value)}
						<DropdownMenu.Item onclick={() => (statusFilter = f.value)}>
							{#if statusFilter === f.value}
								<i class="ri-check-line" aria-hidden="true"></i>
							{/if}
							{f.label}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
			{#if canManage}
				<button
					type="button"
					class="job-visits__add"
					onclick={openCreate}
					aria-label="Schedule a visit"
				>
					<i class="ri-add-line" aria-hidden="true"></i>
				</button>
			{/if}
		</div>
	</div>

	{#if recurrence}
		<div class="job-recur-line">
			<i class="ri-repeat-line job-recur-line__icon" aria-hidden="true"></i>
			<span>{summarizeRecurrence(recurrence)}</span>
			{#if appointmentCount > 0}
				<span class="job-recur-line__count">· {appointmentCount} visits</span>
			{/if}
		</div>
	{/if}

	<!-- Schedule summary (Start date → End date). Shows whenever the job has any date: the span
	     across all visits (first → last), or — for a visitless job (Jobber "As needed") — the
	     stored job-level window. Gated on !loading so it settles to the true span once visits
	     load rather than flashing the first-visit anchor. -->
	{#if !loading && scheduleRange}
		<div class="job-recur-line">
			<i class="ri-calendar-line job-recur-line__icon" aria-hidden="true"></i>
			<span>{scheduleRange}</span>
			{#if scheduleAsNeeded}
				<span class="job-recur-line__count">· As needed</span>
			{/if}
		</div>
	{/if}

	{#if loading}
		<div class="job-visits__skeleton" aria-busy="true" aria-label="Loading visits">
			{#each Array.from({ length: 3 }) as _, i (i)}
				<div class="job-visits__skel-row">
					<div class="job-visits__skel-main">
						<div class="job-visits__skel-line job-visits__skel-line--title skeleton-shimmer"></div>
						<div class="job-visits__skel-line job-visits__skel-line--meta skeleton-shimmer"></div>
					</div>
					<div class="job-visits__skel-actions">
						<div class="job-visits__skel-btn skeleton-shimmer"></div>
						<div class="job-visits__skel-btn skeleton-shimmer"></div>
					</div>
				</div>
			{/each}
		</div>
	{:else if errorMsg}
		<p class="job-section__empty job-section__empty--error">{errorMsg}</p>
	{:else if visits.length === 0}
		<p class="job-visits__empty">
			{#if scheduleAsNeeded}
				No visits yet — this job is scheduled as needed. Add a visit when you're ready.
			{:else}
				No visits on this job yet.
			{/if}
		</p>
	{:else if !anyVisible}
		<p class="job-visits__empty">No {statusFilterLabel.toLowerCase()} visits.</p>
	{:else}
		{#if showToBeScheduled && toBeScheduled.length > 0}
			<h3 class="job-visits__group-head">To be scheduled</h3>
			<ul class="job-visits__list">
				{#each toBeScheduled as v (v.id)}
					<li class="job-visits__item">
						<div class="job-visits__row">
							<button type="button" class="job-visits__main" onclick={() => openDetail(v)}>
								<span class="job-visits__date">{v.title || 'Unscheduled visit'}</span>
								<span class="job-visits__meta">
									<i class="ri-user-line" aria-hidden="true"></i>
									{v.assignee_name ?? 'Unassigned'}
								</span>
							</button>
							{#if canManage}
								<div class="job-visits__actions">
									<button
										type="button"
										class="job-visits__icon-btn job-visits__icon-btn--check"
										onclick={() => completeVisit(v)}
										disabled={busyId !== null}
										aria-label="Complete visit"
									>
										{#if busyId === v.id}
											<i class="ri-loader-4-line job-section__spin" aria-hidden="true"></i>
										{:else}
											<i class="ri-checkbox-circle-line" aria-hidden="true"></i>
										{/if}
									</button>
									<button
										type="button"
										class="job-visits__icon-btn"
										onclick={() => openEdit(v)}
										aria-label="Edit visit"
									>
										<i class="ri-pencil-line" aria-hidden="true"></i>
									</button>
								</div>
							{:else}
								<AppointmentStatusBadge status={v.status} />
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		{#if showUpcoming && upcoming.length > 0}
			<h3 class="job-visits__group-head">Upcoming</h3>
			<ul class="job-visits__list">
				{#each upcoming as v (v.id)}
					<li class="job-visits__item">
						<div class="job-visits__row">
							<button type="button" class="job-visits__main" onclick={() => openDetail(v)}>
								<span class="job-visits__date">{dateLabel(v)}</span>
								<span class="job-visits__meta">
									<i class="ri-user-line" aria-hidden="true"></i>
									{v.assignee_name ?? 'Unassigned'}
									{#if v.location}
										<i class="ri-map-pin-2-line job-visits__meta-sep" aria-hidden="true"></i>
										<span class="job-visits__loc">{v.location}</span>
									{/if}
								</span>
							</button>
							{#if canManage}
								<div class="job-visits__actions">
									<Button
										size="sm"
										loading={busyId === v.id}
										disabled={busyId !== null}
										onclick={() => completeVisit(v)}
									>
										<i class="ri-checkbox-circle-line" aria-hidden="true"></i>
										Complete visit
									</Button>
									<button
										type="button"
										class="job-visits__icon-btn"
										onclick={() => openEdit(v)}
										aria-label="Edit visit"
									>
										<i class="ri-pencil-line" aria-hidden="true"></i>
									</button>
								</div>
							{:else}
								<AppointmentStatusBadge status={v.status} />
							{/if}
						</div>

						{#if v.photos.length > 0}
							<JobVisitPhotos
								{jobId}
								visitId={v.id}
								photos={v.photos}
								canEdit={false}
								onAdded={(item) => patchVisitPhotos(v.id, (p) => [...p, item])}
								onRemoved={(id) => patchVisitPhotos(v.id, (p) => p.filter((x) => x.id !== id))}
							/>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if showPast && past.length > 0}
			<h3 class="job-visits__group-head">Past</h3>
			<ul class="job-visits__list">
				{#each past as v (v.id)}
					<li class="job-visits__item job-visits__item--past">
						<div class="job-visits__row">
							<button type="button" class="job-visits__main" onclick={() => openDetail(v)}>
								<span class="job-visits__date">{dateLabel(v)}</span>
								{#if v.status === 'completed'}
									<span class="job-visits__meta">{completedLabel(v)}</span>
								{:else}
									<span class="job-visits__meta">{STATUS_LABEL[v.status]}</span>
								{/if}
							</button>
							<div class="job-visits__actions">
								<AppointmentStatusBadge status={v.status} />
								{#if canManage && v.status === 'completed'}
									{#if busyId === v.id}
										<i
											class="ri-loader-4-line job-section__spin job-visits__busy"
											aria-label="Marking visit incomplete"
										></i>
									{:else}
										<RowActionsMenu
											label="Visit actions"
											actions={[
												{
													key: 'incomplete',
													label: 'Mark as incomplete',
													icon: 'ri-arrow-go-back-line',
													disabled: busyId !== null,
													onSelect: () => markIncomplete(v)
												}
											]}
										/>
									{/if}
								{/if}
							</div>
						</div>

						{#if v.status === 'completed' && v.completion_notes}
							<p class="job-visits__notes">{v.completion_notes}</p>
						{/if}

						{#if v.photos.length > 0}
							<JobVisitPhotos
								{jobId}
								visitId={v.id}
								photos={v.photos}
								canEdit={false}
								onAdded={(item) => patchVisitPhotos(v.id, (p) => [...p, item])}
								onRemoved={(id) => patchVisitPhotos(v.id, (p) => p.filter((x) => x.id !== id))}
							/>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>

<!-- Shared "Schedule a visit" modal — create (+ / Schedule new visit) and edit (pencil). -->
<VisitScheduleModal
	bind:open={modalOpen}
	mode={modalMode}
	{jobId}
	{jobInfo}
	visit={modalVisit}
	onSaved={() => onChanged?.()}
/>

<!-- Visit Details modal — opened by clicking a visit row (Jobber ref job-detail/6-7). -->
<VisitDetailModal
	bind:open={detailOpen}
	visit={detailVisit}
	{jobId}
	{jobInfo}
	{canManage}
	onComplete={completeFromDetail}
	onEdit={(v) => {
		detailOpen = false;
		openEdit(v);
	}}
	onNotesSaved={patchVisitNotes}
	onPhotoAdded={(id, item) => patchVisitPhotos(id, (p) => [...p, item])}
	onPhotoRemoved={(id, pid) => patchVisitPhotos(id, (p) => p.filter((x) => x.id !== pid))}
/>

<!-- "Final visit completed" popup — raised only after the last open visit is completed (Jobber ref/2). -->
<Dialog.Root open={finalVisit !== null} onOpenChange={(o) => !o && closeFinalPopup()}>
	<Dialog.Content class="visit-final" showClose={false}>
		<div class="visit-final__header">
			<Dialog.Title class="visit-final__title">Final visit completed</Dialog.Title>
			<Dialog.Close class="dialog-content__close" aria-label="Close">
				<i class="ri-close-line" aria-hidden="true"></i>
			</Dialog.Close>
		</div>
		<div class="visit-final__options">
			<button
				type="button"
				class="visit-final__opt"
				disabled={finalBusy}
				onclick={() => finalAction('close')}
			>
				<i class="ri-hammer-line visit-final__opt-icon" aria-hidden="true"></i>
				<span>Close Job</span>
			</button>
			<button
				type="button"
				class="visit-final__opt"
				disabled={finalBusy}
				onclick={() => finalAction('schedule')}
			>
				<i class="ri-truck-line visit-final__opt-icon" aria-hidden="true"></i>
				<span>Schedule new visit</span>
			</button>
			<button
				type="button"
				class="visit-final__opt"
				disabled={finalBusy}
				onclick={() => finalAction('leave')}
			>
				<i class="ri-inbox-line visit-final__opt-icon" aria-hidden="true"></i>
				<span>Leave as Action Required</span>
			</button>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	// Recurrence summary line — carried over from the retired standalone Schedule card
	// (Session 3.3 merge). Private to this component, so it stays scoped.
	.job-recur-line {
		display: flex;
		align-items: center;
		gap: $space-2;
		margin-bottom: $space-3;
		font-size: $fs-body;
		font-weight: 600;
		color: var(--color-text-primary);

		&__icon {
			color: var(--color-brand);
		}

		&__count {
			color: var(--color-text-muted);
			font-weight: 500;
		}
	}

	.job-visits {
		&__head-actions {
			display: inline-flex;
			align-items: center;
			gap: $space-2;
			flex-shrink: 0;
		}

		&__skeleton {
			display: flex;
			flex-direction: column;
		}

		&__skel-row {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: $space-3;
			padding: $space-3 0;
			border-bottom: 1px solid var(--color-border);

			&:last-child {
				border-bottom: none;
			}
		}

		&__skel-main {
			display: flex;
			flex-direction: column;
			gap: $space-2;
			flex: 1 1 auto;
			min-width: 0;
		}

		&__skel-line {
			border-radius: $radius-sm;

			&--title {
				height: 16px;
				width: 55%;
			}

			&--meta {
				height: 13px;
				width: 35%;
			}
		}

		&__skel-actions {
			display: inline-flex;
			align-items: center;
			gap: $space-2;
			flex-shrink: 0;
		}

		&__skel-btn {
			width: 34px;
			height: 34px;
			border-radius: $radius-md;
		}

		&__empty {
			font-size: $fs-body;
			color: var(--color-text-muted);
			font-style: italic;
			margin: 0;
		}

		&__refreshing {
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-muted);
		}

		&__add {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 34px;
			height: 34px;
			border: 1px solid var(--color-border);
			border-radius: $radius-md;
			background: var(--color-bg-surface);
			color: var(--color-brand);
			cursor: pointer;
			transition: border-color $duration-fast $ease-standard;

			i {
				font-size: 1.35rem;
			}

			&:hover {
				border-color: var(--color-brand);
			}
		}

		&__group-head {
			margin: $space-3 0 $space-2;
			font-size: $fs-body;
			font-weight: $weight-bold;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--color-text-secondary);

			&:first-of-type {
				margin-top: 0;
			}
		}

		&__list {
			list-style: none;
			margin: 0;
			padding: 0;
		}

		&__item {
			padding: $space-3 0;
			border-bottom: 1px solid var(--color-border);

			&:last-child {
				border-bottom: none;
			}

			&--past {
				opacity: 0.92;
			}
		}

		&__row {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: $space-3;
		}

		&__main {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			gap: $space-1;
			min-width: 0;
			// Reset the button chrome — the row body is a click target opening Visit Details.
			padding: 0;
			border: none;
			background: none;
			font: inherit;
			text-align: left;
			cursor: pointer;

			&:hover .job-visits__date {
				color: var(--color-brand);
			}
		}

		&__actions {
			display: inline-flex;
			align-items: center;
			gap: $space-2;
			flex-shrink: 0;
		}

		// In-flight spinner that replaces the 3-dot kebab while "Mark as incomplete"
		// runs — same footprint as the trigger so the row doesn't shift.
		&__busy {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 32px;
			height: 32px;
			font-size: 1.5rem;
			color: var(--color-text-secondary);
		}

		&__icon-btn {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 34px;
			height: 34px;
			border: 1px solid var(--color-border);
			border-radius: $radius-md;
			background: var(--color-bg-surface);
			color: var(--color-text-secondary);
			cursor: pointer;
			transition:
				border-color $duration-fast $ease-standard,
				color $duration-fast $ease-standard;

			i {
				font-size: 1.25rem;
			}

			&:hover {
				border-color: var(--color-brand);
				color: var(--color-text-primary);
			}

			&--check:hover {
				color: var(--color-brand);
			}
		}

		&__date {
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
		}

		&__meta {
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			flex-wrap: wrap;
			font-size: $fs-body;
			color: var(--color-text-muted);

			i {
				font-size: 1.1em;
			}
		}

		&__meta-sep {
			margin-left: $space-1;
		}

		&__loc {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		&__notes {
			margin: $space-2 0 0;
			font-size: $fs-body;
			color: var(--color-text-secondary);
			white-space: pre-wrap;
		}
	}

	.visit-final {
		&__header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-3;
			margin-bottom: $space-4;
		}

		&__options {
			display: flex;
			flex-direction: column;
		}

		&__opt {
			display: flex;
			align-items: center;
			gap: $space-3;
			padding: $space-3 $space-2;
			border: none;
			border-bottom: 1px solid var(--color-border);
			background: transparent;
			color: var(--color-text-primary);
			font-size: $fs-body;
			font-weight: $weight-semibold;
			text-align: left;
			cursor: pointer;
			transition: background-color $duration-fast $ease-standard;

			&:last-child {
				border-bottom: none;
			}

			&:hover:not(:disabled) {
				background: var(--color-bg-surface-sunk);
			}

			&:disabled {
				opacity: 0.6;
				cursor: default;
			}
		}

		&__opt-icon {
			font-size: 1.35rem;
			color: var(--color-brand);
			flex-shrink: 0;
		}
	}

	// These classes ride on Bits UI's <Dialog.Title> / <DropdownMenu.Trigger> (child
	// components), so the scoped compiler can't see the element — style them globally
	// (BEM-unique names, no collision risk).
	:global(.visit-final__title) {
		font-size: $fs-lg;
		font-weight: $weight-semibold;
		color: var(--color-text-primary);
	}

	:global(.job-visits__filter) {
		display: inline-flex;
		align-items: center;
		gap: $space-2;
		min-height: 34px;
		padding: $space-1 $space-3;
		border: 1px solid var(--color-border);
		border-radius: $radius-full;
		background: var(--color-bg-surface);
		color: var(--color-text-primary);
		font-size: $fs-body;
		font-weight: $weight-semibold;
		cursor: pointer;
		transition: border-color $duration-fast $ease-standard;
	}

	:global(.job-visits__filter:hover) {
		border-color: var(--color-brand);
	}

	:global(.job-visits__filter-key) {
		color: var(--color-text-muted);
		font-weight: $weight-medium;
	}

	:global(.job-visits__filter-sep) {
		width: 1px;
		height: 14px;
		background: var(--color-border);
	}

	:global(.job-visits__filter i) {
		color: var(--color-text-muted);
		font-size: 1.15rem;
	}
</style>
