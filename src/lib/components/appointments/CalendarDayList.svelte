<script lang="ts">
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import AppointmentCard from './AppointmentCard.svelte';
	import { addDays, dayKey, formatDayLabel, isSameDay } from '$lib/utils/calendar';
	import { formatTimeInOrgTz } from '$lib/utils/formatInOrgTz';
	import { sessionStore } from '$lib/stores/session.svelte';
	import type { AppointmentListItem } from '$lib/types/appointments';
	import type { EventListItem } from '$lib/types/events';
	import { SvelteMap } from 'svelte/reactivity';

	let {
		anchor,
		days,
		items,
		events = []
	}: {
		anchor: Date;
		days: number;
		items: AppointmentListItem[];
		// Non-billable calendar Events (Jobber `Event`) — rendered as neutral grey rows.
		events?: EventListItem[];
	} = $props();

	const orgTz = $derived(sessionStore.data?.org.timezone);
	const today = new Date();

	// One unified row so visits and events share a day section and sort together.
	type DayRow =
		| { kind: 'appt'; id: string; all_day: boolean; start: string; item: AppointmentListItem }
		| { kind: 'event'; id: string; all_day: boolean; start: string; event: EventListItem };

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

	const totalCount = $derived(items.length + events.length);
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
							{:else}
								{@const evt = row.event}
								<div class="cal-daylist__event">
									<span class="cal-daylist__event-time">
										{evt.all_day || !evt.start_at
											? 'All day'
											: formatTimeInOrgTz(evt.start_at, orgTz)}
									</span>
									<div class="cal-daylist__event-body">
										<span class="cal-daylist__event-title">{evt.title}</span>
										<!-- Team block: show the assignee, never the (optional) customer. -->
										{#if evt.assignee_name}
											<span class="cal-daylist__event-sub">
												<i class="ri-team-line" aria-hidden="true"></i>
												{evt.assignee_name}
											</span>
										{/if}
									</div>
								</div>
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
