<script lang="ts">
	import { untrack } from 'svelte';
	import * as Select from '$lib/components/ui/select';
	import AppointmentCard from '$lib/components/appointments/AppointmentCard.svelte';
	import CalendarDayList from '$lib/components/appointments/CalendarDayList.svelte';
	import CalendarWeekGrid from '$lib/components/appointments/CalendarWeekGrid.svelte';
	import CalendarMonthView from '$lib/components/appointments/CalendarMonthView.svelte';
	import CalendarHeader from '$lib/components/appointments/CalendarHeader.svelte';
	import QuickCreatePopover from '$lib/components/appointments/QuickCreatePopover.svelte';
	import MiniCalendar from '$lib/components/appointments/MiniCalendar.svelte';
	import AppointmentsLayout from '$lib/components/appointments/AppointmentsLayout.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { appointmentsStore } from '$lib/stores/appointments.svelte';
	import { eventsStore } from '$lib/stores/events.svelte';
	import { remindersStore } from '$lib/stores/reminders.svelte';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { getMemberContext } from '$lib/context/member';
	import {
		addDays,
		addMonths,
		dayKey,
		startOfDay,
		startOfMonth,
		startOfWeekMonday
	} from '$lib/utils/calendar';
	import type {
		AppointmentStatus,
		AppointmentView,
		CalendarRange,
		CalendarDensity
	} from '$lib/types/appointments';
	import { calendarDensity } from '$lib/stores/calendarDensity.svelte';

	const member = getMemberContext();
	const canViewAll = $derived(member().can_view_all_appointments);
	const canCreate = $derived(member().can_create_appointments);
	const canReschedule = $derived(member().can_reschedule_appointments);
	// Invoice reminders are an invoicing surface — only members who can invoice see them on the
	// calendar (same gate as the job's Reminders tab + the /api/jobs/reminders feed).
	const canInvoice = $derived(member().can_create_invoices);

	let view = $state<AppointmentView>('calendar');
	let range = $state<CalendarRange>('week');

	const dayStartHour = $derived(sessionStore.data?.org.calendar_day_start_hour ?? 7);
	const dayEndHour = $derived(sessionStore.data?.org.calendar_day_end_hour ?? 19);

	let anchor = $state<Date>(startOfWeekMonday(new Date()));
	let statusFilter = $state<AppointmentStatus | 'all'>('all');
	let assignedToFilter = $state<string | null>(null);
	let searchValue = $state('');
	let search = $state('');
	let filterSheetOpen = $state(false);
	let assignees = $state<{ id: string; full_name: string }[]>([]);

	// Header "New" → the inline 3-tab quick-create popup (Job · Visit · Event),
	// available from every view (list / day / week / month, desktop + mobile).
	let quickCreateOpen = $state(false);
	// Default slot for a header-initiated create: the next full hour, one hour long.
	function defaultCreateStart(): Date {
		const d = new Date();
		d.setMinutes(0, 0, 0);
		d.setHours(d.getHours() + 1);
		return d;
	}
	let quickCreateStart = $state<Date>(defaultCreateStart());
	const quickCreateEnd = $derived(new Date(quickCreateStart.getTime() + 60 * 60 * 1000));
	function openQuickCreate() {
		quickCreateStart = defaultCreateStart();
		quickCreateOpen = true;
	}

	const searchActive = $derived(search.trim().length > 0);

	// Debounce search input
	$effect(() => {
		const v = searchValue;
		const t = setTimeout(() => (search = v), 300);
		return () => clearTimeout(t);
	});

	// Normalize a date to the correct anchor for a given range:
	// day → start of day, week → Monday of that week, month → first of the month.
	function anchorFor(r: CalendarRange, d: Date): Date {
		if (r === 'day') return startOfDay(d);
		if (r === 'month') return startOfMonth(d);
		return startOfWeekMonday(d);
	}

	function setRange(next: CalendarRange) {
		range = next;
		anchor = anchorFor(next, new Date());
	}

	function shiftAnchor(direction: 1 | -1) {
		if (range === 'month') {
			anchor = addMonths(anchor, direction);
			return;
		}
		const days = range === 'day' ? 1 : 7;
		anchor = addDays(anchor, direction * days);
	}

	function goToday() {
		anchor = anchorFor(range, new Date());
	}

	function handleDateSelect(d: Date) {
		anchor = anchorFor(range, d);
		view = 'calendar';
	}

	function handleRangeChange(r: CalendarRange) {
		anchor = anchorFor(r, anchor);
	}

	// Drill from the month grid into a single day's detailed view.
	function openDay(d: Date) {
		range = 'day';
		anchor = startOfDay(d);
	}

	const windowDays = $derived(
		view === 'list' ? 30 : range === 'day' ? 1 : range === 'month' ? 42 : 7
	);
	// Month view renders a 6-week (Monday-aligned) grid, so its data window starts
	// on the Monday on/before the 1st and spans 42 days.
	const windowStart = $derived(
		view === 'list'
			? startOfDay(new Date())
			: range === 'month'
				? startOfWeekMonday(anchor)
				: anchor
	);
	const windowEnd = $derived(addDays(windowStart, windowDays));

	const filters = $derived({
		from: windowStart.toISOString(),
		to: windowEnd.toISOString(),
		status: statusFilter,
		assignedTo: assignedToFilter,
		search
	});

	$effect(() => {
		// Depend ONLY on the filter inputs. load() synchronously reads the same cache
		// slot it later writes, so tracking it here would make an optimistic drag-move
		// (a cache write) re-trigger this effect and revalidate stale server data over
		// the move — snapping the card back mid-confirm. untrack keeps that isolated.
		const f = filters;
		untrack(() => void appointmentsStore.load(f));
	});

	// Non-billable calendar Events (Jobber `Event`) — the events API has no status/search,
	// so they key only on the window + assignee. Loaded for the calendar renderings only
	// (not the flat 30-day agenda list or search results — v1 scope).
	const eventFilters = $derived({
		from: windowStart.toISOString(),
		to: windowEnd.toISOString(),
		assignedTo: assignedToFilter
	});
	const showEvents = $derived(view === 'calendar' && !searchActive);

	$effect(() => {
		if (!showEvents) return;
		const f = eventFilters;
		untrack(() => void eventsStore.load(f));
	});

	const events = $derived(showEvents ? eventsStore.items : []);

	// Invoice reminders (Jobber INVOICE_REMINDER) — dated to-dos rendered read-only on the
	// calendar. Same window+assignee feed as Events; only loaded for members who can invoice.
	const showReminders = $derived(view === 'calendar' && !searchActive && canInvoice);

	$effect(() => {
		if (!showReminders) return;
		const f = eventFilters;
		untrack(() => void remindersStore.load(f));
	});

	const reminders = $derived(showReminders ? remindersStore.items : []);

	// After an inline create, revalidate both windows — the new item may be a visit OR
	// an Event (the quick-create popover posts to either endpoint).
	function reloadAfterCreate() {
		void appointmentsStore.load(filters, true);
		if (showEvents) void eventsStore.load(eventFilters, true);
	}

	$effect(() => {
		if (canViewAll && assignees.length === 0) {
			void (async () => {
				try {
					const res = await fetch('/api/appointments/assignees');
					if (res.ok) {
						const body = (await res.json()) as { assignees: { id: string; full_name: string }[] };
						assignees = body.assignees;
					}
				} catch {
					// noop
				}
			})();
		}
	});

	// Org-tz calendar-day key (YYYY-MM-DD), matching the grid's own bucketing so a job
	// scheduled at 9am org-time counts on the org's day regardless of the viewer's tz.
	function orgDayKey(d: Date): string {
		try {
			return new Intl.DateTimeFormat('en-CA', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				timeZone: sessionStore.data?.org.timezone || undefined
			}).format(d);
		} catch {
			return dayKey(d);
		}
	}

	// Day-view (dispatch grid) team-member columns, in order. A member who can't see all
	// appointments only ever sees their own single column; a manager who has picked a
	// specific assignee sees just that one column. Otherwise (manager viewing everyone) we
	// only draw a column for a member who ACTUALLY has a visit/event assigned on this day —
	// so 12 members with work spread across 3 of them yields 3 columns, not 12 empty ones.
	// (The grid adds its own "Unassigned" column when unassigned work exists that day.)
	const dayColumnMembers = $derived.by<{ id: string; name: string }[]>(() => {
		if (!canViewAll) {
			const m = member();
			return [{ id: m.id, name: m.full_name }];
		}
		const base = assignees.map((a) => ({ id: a.id, name: a.full_name }));
		if (assignedToFilter) return base.filter((m) => m.id === assignedToFilter);

		// Members with at least one assigned visit or event on the viewed day.
		const key = orgDayKey(anchor);
		const scheduled = new Set<string>();
		for (const it of items) {
			if (it.assigned_to && orgDayKey(new Date(it.scheduled_start)) === key) {
				scheduled.add(it.assigned_to);
			}
		}
		for (const ev of events) {
			if (ev.assigned_to && ev.start_at && orgDayKey(new Date(ev.start_at)) === key) {
				scheduled.add(ev.assigned_to);
			}
		}
		for (const rem of reminders) {
			if (
				rem.assigned_to &&
				rem.scheduled_start &&
				orgDayKey(new Date(rem.scheduled_start)) === key
			) {
				scheduled.add(rem.assigned_to);
			}
		}
		return base.filter((m) => scheduled.has(m.id));
	});

	const items = $derived(appointmentsStore.items);
	const status = $derived(appointmentsStore.status);
	const errorMsg = $derived(appointmentsStore.error);
	const showSkeleton = $derived(status === 'loading' && items.length === 0);
	const showError = $derived(status === 'error' && items.length === 0);

	const STATUS_OPTIONS: { value: AppointmentStatus | 'all'; label: string }[] = [
		{ value: 'all', label: 'All statuses' },
		{ value: 'scheduled', label: 'Scheduled' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'cancelled', label: 'Cancelled' },
		{ value: 'no_show', label: 'No-show' }
	];
</script>

<svelte:head><title>Schedule</title></svelte:head>

<!-- Page sits under the 64px global topbar on every breakpoint. -->
<div class="appt-page">
	<!-- Toolbar -->
	<CalendarHeader
		bind:view
		bind:range
		bind:searchValue
		{anchor}
		{canCreate}
		density={calendarDensity.value}
		onShiftAnchor={shiftAnchor}
		onGoToday={goToday}
		onFilterOpen={() => (filterSheetOpen = true)}
		onRangeChange={handleRangeChange}
		onDensityChange={(d: CalendarDensity) => calendarDensity.set(d)}
		onNew={openQuickCreate}
	/>

	<!-- Header "New" quick-create popup (centered modal, works in every view). -->
	{#if quickCreateOpen}
		<QuickCreatePopover
			start={quickCreateStart}
			end={quickCreateEnd}
			{assignees}
			canEditAssignee={canViewAll}
			onCreated={reloadAfterCreate}
			onClose={() => (quickCreateOpen = false)}
		/>
	{/if}

	<!-- Body: sidebar + main -->
	<AppointmentsLayout bind:filterSheetOpen>
		{#snippet sidebar(collapsed: boolean)}
			<!-- Mini month calendar -->
			<MiniCalendar {anchor} onDateSelect={handleDateSelect} />

			{#if !collapsed}
				<div class="appt-filters__divider"></div>

				<!-- Status filter -->
				<div class="appt-filters__group">
					<p class="appt-filters__label">Status</p>
					<div class="appt-filters__list">
						{#each STATUS_OPTIONS as opt (opt.value)}
							<button
								type="button"
								onclick={() => (statusFilter = opt.value)}
								class="appt-filters__item"
								class:appt-filters__item--active={statusFilter === opt.value}
							>
								{opt.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Assignee filter -->
				{#if canViewAll && assignees.length > 0}
					<div class="appt-filters__divider"></div>
					<div class="appt-filters__group">
						<p class="appt-filters__label">Assignee</p>
						<Select.Root
							value={assignedToFilter ?? ''}
							onValueChange={(v) => (assignedToFilter = v || null)}
						>
							<Select.Trigger class="field__input">
								<Select.Value placeholder="All assignees" />
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="" label="All assignees">All assignees</Select.Item>
								{#each assignees as a (a.id)}
									<Select.Item value={a.id} label={a.full_name}>{a.full_name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				{/if}
			{/if}
		{/snippet}

		{#snippet filterSheet()}
			<!-- Same filters for mobile sheet -->
			<div class="appt-filters">
				<div class="appt-filters__group">
					<p class="appt-filters__label">Status</p>
					<div class="appt-filters__list">
						{#each STATUS_OPTIONS as opt (opt.value)}
							<button
								type="button"
								onclick={() => {
									statusFilter = opt.value;
									filterSheetOpen = false;
								}}
								class="appt-filters__item appt-filters__item--lg"
								class:appt-filters__item--active={statusFilter === opt.value}
							>
								{opt.label}
							</button>
						{/each}
					</div>
				</div>
				{#if canViewAll && assignees.length > 0}
					<div class="appt-filters__group">
						<p class="appt-filters__label">Assignee</p>
						<Select.Root
							value={assignedToFilter ?? ''}
							onValueChange={(v) => {
								assignedToFilter = v || null;
								filterSheetOpen = false;
							}}
						>
							<Select.Trigger class="field__input">
								<Select.Value placeholder="All assignees" />
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="" label="All assignees">All assignees</Select.Item>
								{#each assignees as a (a.id)}
									<Select.Item value={a.id} label={a.full_name}>{a.full_name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				{/if}
			</div>
		{/snippet}

		{#snippet children()}
			<div class="appt-body">
				{#if showSkeleton}
					<div class="appt-body__pad">
						<SkeletonLoader lines={6} height="92px" label="Loading appointments" />
					</div>
				{:else if showError}
					<div class="appt-body__pad">
						<p class="appt-body__error">{errorMsg}</p>
					</div>
				{:else if searchActive}
					<!-- Search results -->
					{#if items.length === 0}
						<div class="appt-body__pad">
							<EmptyState
								iconClass="ri-search-line"
								title="No matches"
								description="No appointments match your search. Try a different name, title, or address."
							/>
						</div>
					{:else}
						<ul class="appt-body__list">
							{#each items as appointment (appointment.id)}
								<li><AppointmentCard {appointment} /></li>
							{/each}
						</ul>
					{/if}
				{:else if view === 'list'}
					<!-- List view -->
					{#if items.length === 0}
						<div class="appt-body__pad">
							<EmptyState
								iconClass="ri-calendar-line"
								title="No upcoming appointments"
								description={canCreate
									? 'Create your first appointment to see it here.'
									: 'Nothing scheduled in the next 30 days.'}
							/>
						</div>
					{:else}
						<ul class="appt-body__list">
							{#each items as appointment (appointment.id)}
								<li><AppointmentCard {appointment} /></li>
							{/each}
						</ul>
					{/if}
				{:else if range === 'day'}
					<!-- Day view — Jobber dispatch grid (one column per team member) on desktop;
					     stacked day list on narrow screens. -->
					<div class="appt-body__day-list">
						<CalendarDayList {anchor} days={1} {items} {events} {reminders} {canInvoice} />
					</div>
					<div class="appt-body__day-grid">
						<CalendarWeekGrid
							{anchor}
							{items}
							{events}
							{reminders}
							{canInvoice}
							{dayStartHour}
							{dayEndHour}
							{canCreate}
							{canReschedule}
							density={calendarDensity.value}
							{assignees}
							canEditAssignee={canViewAll}
							columnMode="day"
							columnMembers={dayColumnMembers}
							onCreated={reloadAfterCreate}
						/>
					</div>
				{:else if range === 'month'}
					<!-- Month view -->
					<CalendarMonthView
						{anchor}
						{items}
						{events}
						{reminders}
						{canInvoice}
						onDayClick={openDay}
					/>
				{:else}
					<!-- Week view -->
					<div class="appt-body__week-list">
						<CalendarDayList {anchor} days={7} {items} {events} {reminders} {canInvoice} />
					</div>
					<div class="appt-body__week-grid">
						<CalendarWeekGrid
							{anchor}
							{items}
							{events}
							{reminders}
							{canInvoice}
							{dayStartHour}
							{dayEndHour}
							{canCreate}
							{canReschedule}
							density={calendarDensity.value}
							{assignees}
							canEditAssignee={canViewAll}
							onCreated={reloadAfterCreate}
						/>
					</div>
				{/if}
			</div>
		{/snippet}
	</AppointmentsLayout>
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.appt-page {
		display: flex;
		flex-direction: column;
		height: calc(100dvh - 64px);
		overflow: hidden;
	}

	.appt-body {
		flex: 1;
		overflow-y: auto;

		&__pad {
			padding: $space-4;
		}

		&__error {
			font-size: $fs-body;
			color: var(--danger-text);
		}

		&__list {
			display: grid;
			gap: $space-3;
			padding: $space-4;
			list-style: none;
		}

		// Week view: stacked day list on small screens, time grid on desktop.
		&__week-list {
			@media (min-width: $bp-tablet) {
				display: none;
			}
		}

		&__week-grid {
			display: none;

			@media (min-width: $bp-tablet) {
				display: block;
				height: 100%;
			}
		}

		// Day view: stacked day list on small screens, member-column dispatch grid on desktop.
		&__day-list {
			@media (min-width: $bp-tablet) {
				display: none;
			}
		}

		&__day-grid {
			display: none;

			@media (min-width: $bp-tablet) {
				display: block;
				height: 100%;
			}
		}
	}
</style>
