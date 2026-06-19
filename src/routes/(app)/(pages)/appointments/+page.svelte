<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import { CalendarPlus, ChevronLeft, ChevronRight, CalendarDays, Search } from '@lucide/svelte';
	import ListSearchBar from '$lib/components/shared/ListSearchBar.svelte';
	import AppointmentCard from '$lib/components/appointments/AppointmentCard.svelte';
	import CalendarDayList from '$lib/components/appointments/CalendarDayList.svelte';
	import CalendarWeekGrid from '$lib/components/appointments/CalendarWeekGrid.svelte';
	import ViewToggle from '$lib/components/appointments/ViewToggle.svelte';
	import { appointmentsStore } from '$lib/stores/appointments.svelte';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { addDays, startOfDay, startOfWeekMonday, formatDayLabel } from '$lib/utils/calendar';
	import type { AppointmentStatus, AppointmentView, CalendarRange } from '$lib/types/appointments';

	const member = getMemberContext();
	const canViewAll = $derived(member().can_view_all_appointments);
	const canCreate = $derived(member().can_create_appointments);

	let view = $state<AppointmentView>('calendar');
	let range = $state<CalendarRange>('week');

	const dayStartHour = $derived(sessionStore.data?.org.calendar_day_start_hour ?? 7);
	const dayEndHour = $derived(sessionStore.data?.org.calendar_day_end_hour ?? 19);
	let anchor = $state<Date>(startOfWeekMonday(new Date()));
	let statusFilter = $state<AppointmentStatus | 'all'>('all');
	let assignedToFilter = $state<string | null>(null);
	let assignees = $state<{ id: string; full_name: string }[]>([]);
	let searchValue = $state(''); // immediate, bound to the input
	let search = $state(''); // debounced term that drives the query
	const searchActive = $derived(search.trim().length > 0);

	// Anchor changes when range changes (day → today, week → start of week)
	function setRange(next: CalendarRange) {
		range = next;
		anchor = next === 'day' ? startOfDay(new Date()) : startOfWeekMonday(new Date());
	}

	function shiftAnchor(direction: 1 | -1) {
		const days = view === 'calendar' && range === 'day' ? 1 : 7;
		anchor = addDays(anchor, direction * days);
	}

	function goToday() {
		anchor =
			view === 'calendar' && range === 'day'
				? startOfDay(new Date())
				: startOfWeekMonday(new Date());
	}

	const windowDays = $derived(view === 'list' ? 30 : range === 'day' ? 1 : 7);
	const windowStart = $derived(view === 'list' ? startOfDay(new Date()) : anchor);
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

	const headerLabel = $derived.by(() => {
		if (view === 'calendar' && range === 'day') return formatDayLabel(anchor);
		const end = addDays(anchor, 6);
		return `${formatDayLabel(anchor)} – ${formatDayLabel(end)}`;
	});
</script>

<svelte:head><title>Appointments</title></svelte:head>

<PageWrapper title="Appointments" subtitle="Schedule estimates, jobs, and follow-ups">
	<div class="space-y-4">
		<div class="flex flex-wrap items-center justify-between gap-2">
			{#if !searchActive}
				<ViewToggle bind:view />
			{:else}
				<span class="text-sm font-medium text-muted-foreground">Search results</span>
			{/if}
			{#if canCreate}
				<Button href="/appointments/new" size="sm" class="h-9">
					<CalendarPlus class="h-4 w-4" /> New
				</Button>
			{/if}
		</div>

		<ListSearchBar
			bind:value={searchValue}
			placeholder="Search appointments by title, address, or customer"
			onInput={(v) => (search = v)}
		/>

		<div class="grid gap-2 sm:grid-cols-2">
			<div>
				<label for="status-filter" class="sr-only">Status</label>
				<Select.Root bind:value={statusFilter}>
					<Select.Trigger class="h-11 w-full">
						<Select.Value />
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="all">All statuses</Select.Item>
						<Select.Item value="scheduled">Scheduled</Select.Item>
						<Select.Item value="completed">Completed</Select.Item>
						<Select.Item value="cancelled">Cancelled</Select.Item>
						<Select.Item value="no_show">No-show</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
			{#if canViewAll}
				<div>
					<label for="assignee-filter" class="sr-only">Assignee</label>
					<Select.Root
						value={assignedToFilter ?? ''}
						onValueChange={(v) => (assignedToFilter = v || null)}
					>
						<Select.Trigger class="h-11 w-full">
							<Select.Value />
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

		{#if view === 'calendar' && !searchActive}
			<div
				class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
			>
				<div class="flex items-center gap-1">
					<Button variant="ghost" size="icon" class="h-9 w-9" onclick={() => shiftAnchor(-1)}>
						<ChevronLeft class="h-4 w-4" />
					</Button>
					<Button variant="ghost" size="sm" class="h-9" onclick={goToday}>
						<CalendarDays class="h-4 w-4" /> Today
					</Button>
					<Button variant="ghost" size="icon" class="h-9 w-9" onclick={() => shiftAnchor(1)}>
						<ChevronRight class="h-4 w-4" />
					</Button>
					<span class="ml-2 text-sm font-medium text-foreground">{headerLabel}</span>
				</div>
				<div class="inline-flex rounded-md border border-border p-0.5">
					<Button
						variant={range === 'day' ? 'default' : 'ghost'}
						size="sm"
						class="h-8"
						onclick={() => setRange('day')}>Day</Button
					>
					<Button
						variant={range === 'week' ? 'default' : 'ghost'}
						size="sm"
						class="h-8"
						onclick={() => setRange('week')}>Week</Button
					>
				</div>
			</div>
		{/if}

		{#if showSkeleton}
			<SkeletonLoader lines={6} height="92px" label="Loading appointments" />
		{:else if showError}
			<p class="text-sm text-destructive">{errorMsg}</p>
		{:else if searchActive}
			{#if items.length === 0}
				<EmptyState
					icon={Search}
					title="No matches"
					description="No appointments match your search. Try a different name, title, or address."
				/>
			{:else}
				<ul class="grid gap-3">
					{#each items as appointment (appointment.id)}
						<li><AppointmentCard {appointment} /></li>
					{/each}
				</ul>
			{/if}
		{:else if view === 'list'}
			{#if items.length === 0}
				<EmptyState
					icon={CalendarDays}
					title="No upcoming appointments"
					description={canCreate
						? 'Create your first appointment to see it here.'
						: 'Nothing scheduled in the next 30 days.'}
				/>
			{:else}
				<ul class="grid gap-3">
					{#each items as appointment (appointment.id)}
						<li><AppointmentCard {appointment} /></li>
					{/each}
				</ul>
			{/if}
		{:else if range === 'day'}
			<CalendarDayList {anchor} days={1} {items} />
		{:else}
			<!-- Mobile: vertical day list. Desktop: week grid. -->
			<div class="md:hidden">
				<CalendarDayList {anchor} days={7} {items} />
			</div>
			<div class="hidden md:block">
				<CalendarWeekGrid {anchor} {items} {dayStartHour} {dayEndHour} {canCreate} />
			</div>
		{/if}
	</div>
</PageWrapper>
