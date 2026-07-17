<script lang="ts">
	// Visit Details modal (Jobber ref job-detail/6-7). Opened by clicking a visit ROW in
	// JobVisitsSection (the tick/pencil/complete controls stopPropagation). Read-only "Info" tab +
	// an interactive "Notes" tab whose textarea persists to `appointments.completion_notes` and whose
	// attachments reuse JobVisitPhotos (media tag `job_visit_photo`, line_key = visit id).
	//
	// Mark Complete routes back through the parent's existing completeVisit handler (`onComplete`)
	// so the "Final visit completed" Close/Schedule/Leave popup still fires — we never duplicate it.
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import JobVisitPhotos from './JobVisitPhotos.svelte';
	import type { VisitJobInfo } from './VisitScheduleModal.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { formatDateInOrgTz, formatTimeInOrgTz } from '$lib/utils/formatInOrgTz';
	import type { JobVisitRow, JobVisitPhoto } from '$lib/types/jobs';

	let {
		open = $bindable(false),
		visit,
		jobId,
		jobInfo,
		canManage = false,
		onComplete,
		onEdit,
		onNotesSaved,
		onPhotoAdded,
		onPhotoRemoved
	}: {
		open?: boolean;
		// Kept live by the parent (derived from its visits list) so notes/photos stay in sync.
		visit: JobVisitRow | null;
		jobId: string;
		jobInfo: VisitJobInfo;
		canManage?: boolean;
		// Runs the parent's completeVisit — keeps the last-visit popup logic in one place.
		onComplete?: (v: JobVisitRow) => void;
		// Opens the shared schedule modal in edit mode (More Actions → Edit visit).
		onEdit?: (v: JobVisitRow) => void;
		// After a successful notes save, hand the fresh value back so the list row updates.
		onNotesSaved?: (visitId: string, notes: string | null) => void;
		onPhotoAdded?: (visitId: string, item: JobVisitPhoto) => void;
		onPhotoRemoved?: (visitId: string, photoId: string) => void;
	} = $props();

	const orgTz = $derived(sessionStore.data?.org.timezone);

	// An open visit (still schedulable/doable) is the only kind Mark Complete applies to.
	const isOpen = $derived(visit?.status === 'scheduled' || visit?.status === 'unscheduled');

	// Header date line: "Aug 14, 2026 · 9:00 AM – 11:00 AM", "… Anytime", or "Unscheduled".
	const dateLine = $derived.by(() => {
		if (!visit || !visit.scheduled_start) return 'Unscheduled';
		const d = formatDateInOrgTz(visit.scheduled_start, orgTz);
		if (!visit.scheduled_end) return `${d} · Anytime`;
		const start = formatTimeInOrgTz(visit.scheduled_start, orgTz);
		const end = formatTimeInOrgTz(visit.scheduled_end, orgTz);
		return `${d} · ${start} – ${end}`;
	});

	const directionsUrl = $derived(
		jobInfo.address
			? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(jobInfo.address)}`
			: null
	);

	// ── Notes tab (persists to completion_notes) ───────────────────────────────────
	// Seed the draft on each open, and re-seed if the underlying visit's stored note changes
	// (e.g. after a save) — but only while closed/just-opened so typing isn't clobbered.
	let notesDraft = $state('');
	let savingNotes = $state(false);
	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) notesDraft = visit?.completion_notes ?? '';
		wasOpen = open;
	});

	const notesDirty = $derived((visit?.completion_notes ?? '') !== notesDraft.trim());
	const hasNote = $derived(!!visit?.completion_notes && visit.completion_notes.trim().length > 0);

	async function saveNotes() {
		if (!visit || savingNotes) return;
		savingNotes = true;
		try {
			const next = notesDraft.trim() || null;
			const res = await fetch(`/api/appointments/${visit.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ completion_notes: next })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not save the note.');
				return;
			}
			toast.success('Note saved');
			onNotesSaved?.(visit.id, next);
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			savingNotes = false;
		}
	}

	function markComplete() {
		if (!visit) return;
		open = false;
		onComplete?.(visit);
	}
</script>

<Dialog.Root {open} onOpenChange={(o) => (open = o)}>
	<Dialog.Content class="visit-detail" showClose={false}>
		{#if visit}
			<div class="visit-detail__header">
				<Dialog.Title class="visit-detail__title">Visit Details</Dialog.Title>
				<Dialog.Close class="dialog-content__close" aria-label="Close">
					<i class="ri-close-line" aria-hidden="true"></i>
				</Dialog.Close>
			</div>

			<div class="visit-detail__top">
				<div class="visit-detail__ident">
					<h3 class="visit-detail__visit-title">{visit.title || jobInfo.title}</h3>
					{#if jobInfo.address}
						<p class="visit-detail__address">{jobInfo.address}</p>
					{/if}
				</div>
				<dl class="visit-detail__facts">
					<div class="visit-detail__fact">
						<i class="ri-calendar-line" aria-hidden="true"></i>
						<span>{dateLine}</span>
					</div>
					{#if jobInfo.contactPhone}
						<div class="visit-detail__fact">
							<i class="ri-phone-line" aria-hidden="true"></i>
							<a class="visit-detail__link" href={`tel:${jobInfo.contactPhone}`}>
								{jobInfo.contactPhone}
							</a>
						</div>
					{/if}
					{#if directionsUrl}
						<div class="visit-detail__fact">
							<i class="ri-map-pin-2-line" aria-hidden="true"></i>
							<a
								class="visit-detail__link"
								href={directionsUrl}
								target="_blank"
								rel="noopener noreferrer"
							>
								Directions
							</a>
						</div>
					{/if}
				</dl>
			</div>

			{#if canManage}
				<div class="visit-detail__actions">
					{#if isOpen}
						<Button onclick={markComplete}>
							<i class="ri-checkbox-circle-line" aria-hidden="true"></i>
							Mark Complete
						</Button>
					{/if}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger class="visit-detail__more">
							<i class="ri-more-2-fill" aria-hidden="true"></i>
							More Actions
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item onclick={() => visit && onEdit?.(visit)}>
								<i class="ri-pencil-line" aria-hidden="true"></i>
								Edit visit
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			{/if}

			<Tabs.Root value="info" class="visit-detail__tabs">
				<Tabs.List>
					<Tabs.Trigger value="info">Info</Tabs.Trigger>
					<Tabs.Trigger value="notes">
						Notes
						{#if hasNote}<span class="visit-detail__tab-count">1</span>{/if}
					</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="info">
					<div class="visit-detail__section">
						<h4 class="visit-detail__section-head">Instructions</h4>
						{#if visit.notes}
							<p class="visit-detail__text">{visit.notes}</p>
						{:else}
							<p class="visit-detail__muted">No additional instructions</p>
						{/if}
					</div>
					<div class="visit-detail__meta-grid">
						<div>
							<h4 class="visit-detail__section-head">Team</h4>
							{#if visit.assignee_name}
								<span class="badge badge--neutral">{visit.assignee_name}</span>
							{:else}
								<p class="visit-detail__muted">Unassigned</p>
							{/if}
						</div>
						{#if visit.location}
							<div>
								<h4 class="visit-detail__section-head">Location</h4>
								<p class="visit-detail__text">{visit.location}</p>
							</div>
						{/if}
					</div>
				</Tabs.Content>

				<Tabs.Content value="notes">
					<div class="visit-detail__section">
						{#if canManage}
							<textarea
								class="field__textarea"
								rows="4"
								maxlength="5000"
								bind:value={notesDraft}
								placeholder="Add a note for this visit…"
							></textarea>
						{:else if visit.completion_notes}
							<p class="visit-detail__text">{visit.completion_notes}</p>
						{:else}
							<p class="visit-detail__muted">No notes.</p>
						{/if}

						<div class="visit-detail__photos">
							<JobVisitPhotos
								{jobId}
								visitId={visit.id}
								photos={visit.photos}
								canEdit={canManage}
								onAdded={(item) => visit && onPhotoAdded?.(visit.id, item)}
								onRemoved={(pid) => visit && onPhotoRemoved?.(visit.id, pid)}
							/>
						</div>

						{#if canManage}
							<div class="visit-detail__notes-footer">
								<Button loading={savingNotes} disabled={!notesDirty} onclick={saveNotes}>
									Save note
								</Button>
							</div>
						{/if}
					</div>
				</Tabs.Content>
			</Tabs.Root>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.visit-detail {
		&__header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-3;
			margin-bottom: $space-4;
		}

		&__top {
			display: grid;
			grid-template-columns: 1fr auto;
			gap: $space-5;
			padding-bottom: $space-4;
			border-bottom: 1px solid var(--color-border);
		}

		&__ident {
			min-width: 0;
		}

		&__visit-title {
			margin: 0 0 $space-1;
			font-size: $fs-lg;
			font-weight: $weight-bold;
			color: var(--color-text-primary);
		}

		&__address {
			margin: 0;
			font-size: $fs-body;
			color: var(--color-text-muted);
			white-space: pre-line;
		}

		&__facts {
			display: flex;
			flex-direction: column;
			gap: $space-2;
			margin: 0;
		}

		&__fact {
			display: inline-flex;
			align-items: center;
			gap: $space-2;
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);

			i {
				color: var(--color-brand);
				font-size: 1.15rem;
			}
		}

		&__link {
			color: var(--color-brand);
			text-decoration: none;
			font-weight: $weight-semibold;

			&:hover {
				text-decoration: underline;
			}
		}

		&__actions {
			display: flex;
			gap: $space-3;
			margin-top: $space-4;
		}

		&__section {
			padding-top: $space-4;
		}

		&__section-head {
			margin: 0 0 $space-2;
			font-size: $fs-body;
			font-weight: $weight-bold;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--color-text-secondary);
		}

		&__text {
			margin: 0;
			font-size: $fs-body;
			color: var(--color-text-primary);
			white-space: pre-wrap;
		}

		&__muted {
			margin: 0;
			font-size: $fs-body;
			color: var(--color-text-muted);
			font-style: italic;
		}

		&__meta-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: $space-4;
			margin-top: $space-4;
			padding-top: $space-4;
			border-top: 1px solid var(--color-border);
		}

		&__photos {
			margin-top: $space-3;
		}

		&__notes-footer {
			display: flex;
			justify-content: flex-end;
			margin-top: $space-3;
		}
	}

	// Classes riding on Bits UI children (Dialog.Title / Tabs.Trigger) — scoped hash can't
	// reach them, so declare globally. BEM-unique names, no collision risk.
	:global(.visit-detail__title) {
		font-size: $fs-lg;
		font-weight: $weight-semibold;
		color: var(--color-text-primary);
	}

	:global(.visit-detail__tabs) {
		margin-top: $space-4;
	}

	:global(.visit-detail__tab-count) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		margin-left: $space-1;
		padding: 0 5px;
		border-radius: $radius-full;
		background: var(--color-bg-surface-sunk);
		font-size: 0.7rem;
		font-weight: $weight-bold;
		color: var(--color-text-secondary);
	}

	// bits-ui's Trigger renders an unstyled <button> — give "More Actions" the outline-button look.
	:global(.visit-detail__more) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: $space-2;
		min-height: 40px;
		padding: 0 $space-4;
		border: 1px solid var(--color-border);
		border-radius: $radius-full;
		background: var(--color-bg-surface);
		color: var(--color-brand);
		font-size: $fs-body;
		font-weight: $weight-semibold;
		cursor: pointer;
		transition: border-color $duration-fast $ease-standard;
	}

	:global(.visit-detail__more:hover) {
		border-color: var(--color-brand);
	}

	:global(.dialog-content.visit-detail) {
		max-width: 640px;
		max-height: calc(100vh - #{$space-8});
		overflow-y: auto;
	}
</style>
