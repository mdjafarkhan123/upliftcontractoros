<script lang="ts">
	import { addDays, dayKey, isSameDay, startOfWeekMonday } from '$lib/utils/calendar';
	import { formatTimeInOrgTz } from '$lib/utils/formatInOrgTz';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { appointmentsStore } from '$lib/stores/appointments.svelte';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import ReminderDetailController from './ReminderDetailController.svelte';
	import type { AppointmentListItem } from '$lib/types/appointments';
	import type { EventListItem } from '$lib/types/events';
	import type { ReminderCalendarItem } from '$lib/types/reminders';
	import { isEventPast } from '$lib/appointments/eventState';
	import { reminderDisplayStatus } from '$lib/jobs/billing';

	let {
		anchor,
		items,
		events = [],
		reminders = [],
		canInvoice = false,
		onDayClick
	}: {
		anchor: Date; // start of the displayed month
		items: AppointmentListItem[];
		// Non-billable calendar Events (Jobber `Event`) — rendered as neutral grey pills.
		events?: EventListItem[];
		// Invoice reminders (Jobber INVOICE_REMINDER) — read-only amber pills.
		reminders?: ReminderCalendarItem[];
		canInvoice?: boolean;
		onDayClick: (d: Date) => void;
	} = $props();

	const orgTz = $derived(sessionStore.data?.org.timezone);

	let reminderCtl: ReminderDetailController;

	const MAX_VISIBLE = 3; // pills shown per cell before "+N more"
	const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const today = new Date();

	// One unified pill so visits and events share a cell, sort together, and count
	// toward the same "+N more" overflow (they occupy the same visual grid).
	type MonthPill =
		| { kind: 'appt'; id: string; all_day: boolean; start: string; item: AppointmentListItem }
		| { kind: 'event'; id: string; all_day: boolean; start: string; event: EventListItem }
		| {
				kind: 'reminder';
				id: string;
				all_day: boolean;
				start: string;
				reminder: ReminderCalendarItem;
		  };

	// Resolve an item to its calendar day in the org's timezone so an 11pm org-time
	// item lands on the correct cell regardless of the viewer's browser tz.
	function tzDateKey(d: Date, tz: string | undefined): string {
		try {
			return new Intl.DateTimeFormat('en-CA', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				timeZone: tz || undefined
			}).format(d);
		} catch {
			return dayKey(d);
		}
	}

	const eventsByDay = $derived.by(() => {
		const map = new Map<string, MonthPill[]>();
		const push = (key: string, pill: MonthPill) => {
			const arr = map.get(key);
			if (arr) arr.push(pill);
			else map.set(key, [pill]);
		};
		for (const item of items) {
			push(tzDateKey(new Date(item.scheduled_start), orgTz), {
				kind: 'appt',
				id: item.id,
				all_day: item.all_day,
				start: item.scheduled_start,
				item
			});
		}
		for (const ev of events) {
			if (!ev.start_at) continue;
			push(tzDateKey(new Date(ev.start_at), orgTz), {
				kind: 'event',
				id: ev.id,
				all_day: ev.all_day,
				start: ev.start_at,
				event: ev
			});
		}
		for (const rem of reminders) {
			if (!rem.scheduled_start) continue;
			push(tzDateKey(new Date(rem.scheduled_start), orgTz), {
				kind: 'reminder',
				id: rem.id,
				all_day: rem.all_day,
				start: rem.scheduled_start,
				reminder: rem
			});
		}
		for (const arr of map.values()) {
			// All-day/anytime sit at the top of each cell (Housecall Pro), then timed by start.
			arr.sort((a, b) => {
				if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
				return a.start.localeCompare(b.start);
			});
		}
		return map;
	});

	// 6 weeks × 7 days, Monday-aligned, covering the whole month plus spill days.
	const cells = $derived.by(() => {
		const gridStart = startOfWeekMonday(anchor);
		const month = anchor.getMonth();
		const out: { date: Date; key: string; inMonth: boolean }[] = [];
		for (let i = 0; i < 42; i++) {
			const date = addDays(gridStart, i);
			out.push({ date, key: dayKey(date), inMonth: date.getMonth() === month });
		}
		return out;
	});

	function pillClasses(s: AppointmentListItem['status']): string {
		if (s === 'cancelled' || s === 'no_show') return 'cal-month__pill--cancelled';
		if (s === 'completed') return 'cal-month__pill--completed';
		return 'cal-month__pill--default';
	}
</script>

<div class="cal-month">
	<!-- Weekday header row -->
	<div class="cal-month__dow">
		{#each WEEKDAYS as wd (wd)}
			<div class="cal-month__dow-cell">{wd}</div>
		{/each}
	</div>

	<!-- 6-week grid -->
	<div class="cal-month__grid">
		{#each cells as cell (cell.key)}
			{@const dayItems = eventsByDay.get(cell.key) ?? []}
			{@const isToday = isSameDay(cell.date, today)}
			{@const overflow = dayItems.length - MAX_VISIBLE}
			<div class={['cal-month__cell', !cell.inMonth && 'cal-month__cell--out']}>
				<!-- Date number -->
				<button
					type="button"
					onclick={() => onDayClick(cell.date)}
					class={[
						'cal-month__date',
						isToday && 'cal-month__date--today',
						!isToday && !cell.inMonth && 'cal-month__date--out'
					]}
					aria-label={`View ${cell.date.toDateString()}`}
				>
					{cell.date.getDate()}
				</button>

				<!-- Pills: visits (colored by type/status) + Events (neutral grey) -->
				<div class="cal-month__pills">
					{#each dayItems.slice(0, MAX_VISIBLE) as pill (pill.id)}
						{#if pill.kind === 'appt'}
							{@const ev = pill.item}
							<a
								href={ev.request_id ? `/requests/${ev.request_id}` : `/appointments/${ev.id}`}
								use:prefetchOnIntent={() =>
									ev.request_id ? undefined : appointmentsStore.prefetchDetail(ev.id)}
								class={[
									'cal-month__pill',
									pillClasses(ev.status),
									`cal-month__pill--type-${ev.type}`
								]}
							>
								<span class="cal-month__pill-time">
									{ev.all_day ? 'Anytime' : formatTimeInOrgTz(ev.scheduled_start, orgTz)}
								</span>
								<span class="cal-month__pill-title">{ev.title}</span>
							</a>
						{:else if pill.kind === 'event'}
							{@const evt = pill.event}
							{@const evtDone = isEventPast(evt)}
							<div
								class={[
									'cal-month__pill',
									'cal-month__pill--event',
									evtDone && 'cal-month__pill--completed'
								]}
								title={evt.title}
							>
								<span class="cal-month__pill-time">
									{evt.all_day || !evt.start_at
										? 'All day'
										: formatTimeInOrgTz(evt.start_at, orgTz)}
								</span>
								<span class="cal-month__pill-title">
									{#if evtDone}<i class="ri-check-line" aria-hidden="true"></i>
									{/if}{evt.title}
								</span>
							</div>
						{:else}
							{@const rem = pill.reminder}
							{@const state = reminderDisplayStatus(rem)}
							<!-- Invoice reminder: read-only amber pill. Click → detail popover. -->
							<button
								type="button"
								class={[
									'cal-month__pill',
									'cal-month__pill--reminder',
									`cal-month__pill--rem-${state}`
								]}
								title={rem.description || 'Invoice reminder'}
								onclick={(e) => reminderCtl.open(rem, e.currentTarget)}
							>
								<span class="cal-month__pill-time">
									<i class="ri-bill-line" aria-hidden="true"></i>
									{rem.all_day || !rem.scheduled_start
										? 'Anytime'
										: formatTimeInOrgTz(rem.scheduled_start, orgTz)}
								</span>
								<span class="cal-month__pill-title">
									{rem.description || 'Invoice reminder'}
								</span>
							</button>
						{/if}
					{/each}
					{#if overflow > 0}
						<button type="button" onclick={() => onDayClick(cell.date)} class="cal-month__more">
							+{overflow} more
						</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

<ReminderDetailController bind:this={reminderCtl} {canInvoice} />
