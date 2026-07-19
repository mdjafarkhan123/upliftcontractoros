<script lang="ts">
	import DraggablePanel from '$lib/components/shared/DraggablePanel.svelte';
	import EventFormDialog from './EventFormDialog.svelte';
	import { formatTimeInOrgTz } from '$lib/utils/formatInOrgTz';
	import { isEventPast } from '$lib/appointments/eventState';
	import { toast } from '$lib/stores/toast.svelte';
	import type { EventListItem } from '$lib/types/events';

	// Click-a-card detail popover for a calendar Event (Jobber ref/event/4). Deliberately
	// minimal — an Event is just a blocked time slot, so it shows the title, the word
	// "Event", and its Start / End. Per the spec it carries an Edit button (opens the shared
	// Edit modal) and a Delete button (soft-deletes) — NOT the visit popover's Details link.
	// Reuses the same DraggablePanel shell + `card-detail-pop` styling as the visit popover.
	let {
		event,
		anchorEl,
		orgTz,
		// can_reschedule_appointments — gates Edit + Delete (same permission events already use).
		canEdit = false,
		onRefresh,
		onDeleted,
		onClose
	}: {
		event: EventListItem | null;
		anchorEl: HTMLElement | null;
		orgTz: string | undefined;
		canEdit?: boolean;
		// Revalidate the calendar after an edit saves.
		onRefresh?: () => void;
		// Fired after a successful delete so the parent can drop the card + close.
		onDeleted?: (id: string) => void;
		onClose: () => void;
	} = $props();

	let editOpen = $state(false);
	let deleting = $state(false);

	// Jobber auto-completes an event once its window passes — read-only, no toggle.
	const done = $derived(event ? isEventPast(event) : false);

	function formatDateInOrgTz(iso: string): string {
		try {
			return new Intl.DateTimeFormat('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				timeZone: orgTz || undefined
			}).format(new Date(iso));
		} catch {
			return new Date(iso).toLocaleDateString();
		}
	}

	async function remove() {
		if (!event || deleting) return;
		deleting = true;
		try {
			const res = await fetch(`/api/events/${event.id}`, { method: 'DELETE' });
			if (res.status !== 204) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				toast.error(body.error ?? 'Could not delete the event.');
				return;
			}
			toast.success('Event deleted');
			onDeleted?.(event.id);
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			deleting = false;
		}
	}
</script>

<DraggablePanel {anchorEl} ariaLabel="Event details" {onClose}>
	<div class="card-detail-pop card-detail-pop--panel">
		{#if event}
			<h3 class="card-detail-pop__title">{event.title}</h3>
			<p class="card-detail-pop__subtype">Event</p>

			<!-- Auto-completed once the event's time has passed (Jobber — no manual toggle). -->
			{#if done}
				<div class="card-detail-pop__done card-detail-pop__done--on">
					<i class="ri-checkbox-line" aria-hidden="true"></i>
					<span>Completed</span>
				</div>
			{/if}

			{#if event.description}
				<div class="card-detail-pop__details">
					<p class="card-detail-pop__instructions">{event.description}</p>
				</div>
			{/if}

			<!-- When: Start / End (Jobber ref/event/4). All-day shows a single "Anytime" column. -->
			{#if event.all_day && event.start_at}
				<div class="card-detail-pop__when">
					<div class="card-detail-pop__when-col">
						<span class="card-detail-pop__when-label">When</span>
						<span class="card-detail-pop__when-date">{formatDateInOrgTz(event.start_at)}</span>
						<span class="card-detail-pop__when-time">Anytime</span>
					</div>
				</div>
			{:else if event.start_at}
				<div class="card-detail-pop__when card-detail-pop__when--range">
					<div class="card-detail-pop__when-col">
						<span class="card-detail-pop__when-label">Start</span>
						<span class="card-detail-pop__when-date">{formatDateInOrgTz(event.start_at)}</span>
						<span class="card-detail-pop__when-time">{formatTimeInOrgTz(event.start_at, orgTz)}</span>
					</div>
					{#if event.end_at}
						<div class="card-detail-pop__when-col">
							<span class="card-detail-pop__when-label">End</span>
							<span class="card-detail-pop__when-date">{formatDateInOrgTz(event.end_at)}</span>
							<span class="card-detail-pop__when-time">{formatTimeInOrgTz(event.end_at, orgTz)}</span>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Footer: Edit + Delete (spec swaps Jobber's "Details" for a Delete). -->
			{#if canEdit}
				<footer class="card-detail-pop__foot">
					<span class="card-detail-pop__foot-spacer"></span>
					<button
						type="button"
						class="card-detail-pop__btn card-detail-pop__btn--danger"
						disabled={deleting}
						onclick={remove}
					>
						{#if deleting}
							<i class="ri-loader-4-line card-detail-pop__spin" aria-hidden="true"></i>
						{:else}
							<i class="ri-delete-bin-line" aria-hidden="true"></i>
						{/if}
						<span>Delete</span>
					</button>
					<button
						type="button"
						class="card-detail-pop__btn card-detail-pop__btn--primary"
						onclick={() => (editOpen = true)}
					>
						Edit
					</button>
				</footer>
			{/if}

			<!-- Shared Edit modal (Jobber ref/event/5). Portals to body, so it survives inside
			     this draggable popover (DraggablePanel excludes dialog portals from outside-click). -->
			<EventFormDialog
				bind:open={editOpen}
				mode="edit"
				{event}
				onSaved={() => {
					onRefresh?.();
					onClose();
				}}
			/>
		{/if}
	</div>
</DraggablePanel>
