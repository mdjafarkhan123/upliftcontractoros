<script lang="ts">
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import AppointmentCard from './AppointmentCard.svelte';
	import ReminderDetailController from './ReminderDetailController.svelte';
	import { addDays, dayKey, formatDayLabel, isSameDay } from '$lib/utils/calendar';
	import { formatTimeInOrgTz } from '$lib/utils/formatInOrgTz';
	import { sessionStore } from '$lib/stores/session.svelte';
	import type { AppointmentListItem } from '$lib/types/appointments';
	import type { EventListItem } from '$lib/types/events';
	import type { ReminderCalendarItem } from '$lib/types/reminders';
	import { isEventPast } from '$lib/appointments/eventState';
	import { reminderDisplayStatus, REMINDER_DISPLAY_LABEL } from '$lib/jobs/billing';
	import { SvelteMap } from 'svelte/reactivity';

	let {
		anchor,
		days,
		items,
		events = [],
		reminders = [],
		canInvoice = false
	}: {
		anchor: Date;
		days: number;
		items: AppointmentListItem[];
		// Non-billable calendar Events (Jobber `Event`) — rendered as neutral grey rows.
		events?: EventListItem[];
		// Invoice reminders (Jobber INVOICE_REMINDER) — read-only amber to-do rows.
		reminders?: ReminderCalendarItem[];
		canInvoice?: boolean;
	} = $props();

	const orgTz = $derived(sessionStore.data?.org.timezone);
	const today = new Date();

	let reminderCtl: ReminderDetailController;

	// One unified row so visits, events, and reminders share a day section and sort together.
	type DayRow =
		| { kind: 'appt'; id: string; all_day: boolean; start: string; item: AppointmentListItem }
		| { kind: 'event'; id: string; all_day: boolean; start: string; event: EventListItem }
		| {
				kind: 'reminder';
				id: string;
				all_day: boolean;
				start: string;
				reminder: ReminderCalendarItem;
		  };

	const buckets = $derived.by(() => {
		const map = new SvelteMap<string, DayRow[]>();
		for (let i = 0; i < days; i++) {
			map.set(dayKey(addDays(anchor, i)), []);
		}
		for (const item of items) {
			map.get(dayKey(new Date(item.scheduled_start)))?.push({
				kind: 'appt',
				id: item.id,
				all_day: item.all_day,
				start: item.scheduled_start,
				item
			});
		}
		for (const ev of events) {
			if (!ev.start_at) continue;
			map.get(dayKey(new Date(ev.start_at)))?.push({
				kind: 'event',
				id: ev.id,
				all_day: ev.all_day,
				start: ev.start_at,
				event: ev
			});
		}
		for (const rem of reminders) {
			if (!rem.scheduled_start) continue;
			map.get(dayKey(new Date(rem.scheduled_start)))?.push({
				kind: 'reminder',
				id: rem.id,
				all_day: rem.all_day,
				start: rem.scheduled_start,
				reminder: rem
			});
		}
		return Array.from(map.entries()).map(([k, list]) => ({
			key: k,
			date: new Date(`${k}T00:00:00`),
			// Timed first (by start), then Anytime/all-day (Jobber list order).
			rows: [...list].sort((a, b) => {
				if (a.all_day !== b.all_day) return a.all_day ? 1 : -1;
				return a.start.localeCompare(b.start);
			})
		}));
	});

	const totalCount = $derived(items.length + events.length + reminders.length);
</script>

<div class="cal-daylist">
	{#each buckets as bucket (bucket.key)}
		<section>
			<h3
				class={[
					'cal-daylist__heading',
					isSameDay(bucket.date, today) && 'cal-daylist__heading--today'
				]}
			>
				{formatDayLabel(bucket.date)}
				{#if isSameDay(bucket.date, today)}
					<span class="cal-daylist__today-tag">· Today</span>
				{/if}
			</h3>
			{#if bucket.rows.length === 0}
				<p class="cal-daylist__empty">Nothing scheduled.</p>
			{:else}
				<ul class="cal-daylist__items">
					{#each bucket.rows as row (row.id)}
						<li>
							{#if row.kind === 'appt'}
								<AppointmentCard appointment={row.item} />
							{:else if row.kind === 'event'}
								{@const evt = row.event}
								{@const evtDone = isEventPast(evt)}
								<div class={['cal-daylist__event', evtDone && 'cal-daylist__event--completed']}>
									<span class="cal-daylist__event-time">
										{evt.all_day || !evt.start_at
											? 'All day'
											: formatTimeInOrgTz(evt.start_at, orgTz)}
									</span>
									<div class="cal-daylist__event-body">
										<span class="cal-daylist__event-title">
											{#if evtDone}<i class="ri-check-line" aria-hidden="true"></i>
											{/if}{evt.title}
										</span>
										<!-- Team block: show the assignee, never the (optional) customer. -->
										{#if evt.assignee_name}
											<span class="cal-daylist__event-sub">
												<i class="ri-team-line" aria-hidden="true"></i>
												{evt.assignee_name}
											</span>
										{/if}
									</div>
								</div>
							{:else}
								{@const rem = row.reminder}
								{@const state = reminderDisplayStatus(rem)}
								<!-- Invoice reminder: read-only amber to-do row. Click → detail popover. -->
								<button
									type="button"
									class={['cal-daylist__reminder', `cal-daylist__reminder--${state}`]}
									onclick={(e) => reminderCtl.open(rem, e.currentTarget)}
								>
									<span class="cal-daylist__reminder-time">
										<i class="ri-bill-line" aria-hidden="true"></i>
										{rem.all_day ? 'Anytime' : formatTimeInOrgTz(rem.scheduled_start!, orgTz)}
									</span>
									<div class="cal-daylist__event-body">
										<span class="cal-daylist__event-title">
											{rem.description || 'Invoice reminder'}
										</span>
										<span class="cal-daylist__event-sub">
											{rem.contact_name} · {REMINDER_DISPLAY_LABEL[state]}
										</span>
									</div>
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/each}

	{#if totalCount === 0}
		<EmptyState title="Nothing scheduled" description="Nothing in this range." />
	{/if}
</div>

<ReminderDetailController bind:this={reminderCtl} {canInvoice} />
