<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import { CalendarDays, Search } from '@lucide/svelte';
	import AppointmentCard from '$lib/components/appointments/AppointmentCard.svelte';
	import CalendarDayList from '$lib/components/appointments/CalendarDayList.svelte';
	import CalendarWeekGrid from '$lib/components/appointments/CalendarWeekGrid.svelte';
	import CalendarMonthView from '$lib/components/appointments/CalendarMonthView.svelte';
	import CalendarHeader from '$lib/components/appointments/CalendarHeader.svelte';
	import MiniCalendar from '$lib/components/appointments/MiniCalendar.svelte';
	import AppointmentsLayout from '$lib/components/appointments/AppointmentsLayout.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { appointmentsStore } from '$lib/stores/appointments.svelte';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { addDays, addMonths, startOfDay, startOfMonth, startOfWeekMonday } from '$lib/utils/calendar';
	import type { AppointmentStatus, AppointmentView, CalendarRange } from '$lib/types/appointments';
	import { cn } from '$lib/utils/cn';

	const member = getMemberContext();
	const canViewAll = $derived(member().can_view_all_appointments);
	const canCreate = $derived(member().can_create_appointments);
	const canReschedule = $derived(member().can_reschedule_appointments);

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
		void appointmentsStore.load(filters);
	});

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

<svelte:head><title>Appointments</title></svelte:head>

<!-- Mobile: subtract AppHeader (64px) + bottom nav. Desktop: full viewport (AppHeader is md:hidden). -->
<div class="flex h-[calc(100dvh-64px)] flex-col overflow-hidden md:h-screen">
	<!-- Toolbar -->
	<CalendarHeader
		bind:view
		bind:range
		bind:searchValue
		{anchor}
		{canCreate}
		onShiftAnchor={shiftAnchor}
		onGoToday={goToday}
		onFilterOpen={() => (filterSheetOpen = true)}
		onRangeChange={handleRangeChange}
	/>

	<!-- Body: sidebar + main -->
	<AppointmentsLayout bind:filterSheetOpen>
		{#snippet sidebar()}
			<!-- Mini month calendar -->
			<MiniCalendar {anchor} onDateSelect={handleDateSelect} />

			<div class="mx-3 border-t border-border/60"></div>

			<!-- Status filter -->
			<div class="px-3 py-3">
				<p class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
					Status
				</p>
				<div class="flex flex-col gap-0.5">
					{#each STATUS_OPTIONS as opt (opt.value)}
						<button
							type="button"
							onclick={() => (statusFilter = opt.value)}
							class={cn(
								'flex h-8 items-center rounded-md px-2.5 text-sm transition-colors',
								statusFilter === opt.value
									? 'bg-primary/10 font-medium text-primary'
									: 'text-foreground hover:bg-muted'
							)}
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Assignee filter -->
			{#if canViewAll && assignees.length > 0}
				<div class="mx-3 border-t border-border/60"></div>
				<div class="px-3 py-3">
					<p class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						Assignee
					</p>
					<Select.Root
						value={assignedToFilter ?? ''}
						onValueChange={(v) => (assignedToFilter = v || null)}
					>
						<Select.Trigger class="h-9 w-full text-sm">
							<Select.Value placeholder="All assignees" />
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="">All assignees</Select.Item>
							{#each assignees as a (a.id)}
								<Select.Item value={a.id}>{a.full_name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{/if}
		{/snippet}

		{#snippet filterSheet()}
			<!-- Same filters for mobile sheet -->
			<div class="space-y-4">
				<div>
					<p class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Status
					</p>
					<div class="flex flex-col gap-0.5">
						{#each STATUS_OPTIONS as opt (opt.value)}
							<button
								type="button"
								onclick={() => {
									statusFilter = opt.value;
									filterSheetOpen = false;
								}}
								class={cn(
									'flex h-10 items-center rounded-md px-3 text-sm transition-colors',
									statusFilter === opt.value
										? 'bg-primary/10 font-medium text-primary'
										: 'text-foreground hover:bg-muted'
								)}
							>
								{opt.label}
							</button>
						{/each}
					</div>
				</div>
				{#if canViewAll && assignees.length > 0}
					<div>
						<p class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Assignee
						</p>
						<Select.Root
							value={assignedToFilter ?? ''}
							onValueChange={(v) => {
								assignedToFilter = v || null;
								filterSheetOpen = false;
							}}
						>
							<Select.Trigger class="h-11 w-full">
								<Select.Value placeholder="All assignees" />
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="">All assignees</Select.Item>
								{#each assignees as a (a.id)}
									<Select.Item value={a.id}>{a.full_name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				{/if}
			</div>
		{/snippet}

		{#snippet children()}
			<div class="flex-1 overflow-y-auto">
				{#if showSkeleton}
					<div class="p-4">
						<SkeletonLoader lines={6} height="92px" label="Loading appointments" />
					</div>
				{:else if showError}
					<div class="p-4">
						<p class="text-sm text-destructive">{errorMsg}</p>
					</div>
				{:else if searchActive}
					<!-- Search results -->
					{#if items.length === 0}
						<div class="p-4">
							<EmptyState
								icon={Search}
								title="No matches"
								description="No appointments match your search. Try a different name, title, or address."
							/>
						</div>
					{:else}
						<ul class="grid gap-3 p-4">
							{#each items as appointment (appointment.id)}
								<li><AppointmentCard {appointment} /></li>
							{/each}
						</ul>
					{/if}
				{:else if view === 'list'}
					<!-- List view -->
					{#if items.length === 0}
						<div class="p-4">
							<EmptyState
								icon={CalendarDays}
								title="No upcoming appointments"
								description={canCreate
									? 'Create your first appointment to see it here.'
									: 'Nothing scheduled in the next 30 days.'}
							/>
						</div>
					{:else}
						<ul class="grid gap-3 p-4">
							{#each items as appointment (appointment.id)}
								<li><AppointmentCard {appointment} /></li>
							{/each}
						</ul>
					{/if}
				{:else if range === 'day'}
					<!-- Day view -->
					<CalendarDayList {anchor} days={1} {items} />
				{:else if range === 'month'}
					<!-- Month view -->
					<CalendarMonthView {anchor} {items} onDayClick={openDay} />
				{:else}
					<!-- Week view -->
					<div class="md:hidden">
						<CalendarDayList {anchor} days={7} {items} />
					</div>
					<div class="hidden md:block h-full">
						<CalendarWeekGrid
							{anchor}
							{items}
							{dayStartHour}
							{dayEndHour}
							{canCreate}
							{canReschedule}
						/>
					</div>
				{/if}
			</div>
		{/snippet}
	</AppointmentsLayout>
</div>

<style>
</style>
