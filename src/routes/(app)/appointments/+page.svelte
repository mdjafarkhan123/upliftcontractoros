<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import { CalendarPlus, ChevronLeft, ChevronRight, CalendarDays } from '@lucide/svelte';
	import AppointmentCard from '$lib/components/appointments/AppointmentCard.svelte';
	import CalendarDayList from '$lib/components/appointments/CalendarDayList.svelte';
	import CalendarWeekGrid from '$lib/components/appointments/CalendarWeekGrid.svelte';
	import ViewToggle from '$lib/components/appointments/ViewToggle.svelte';
	import { appointmentsStore } from '$lib/stores/appointments.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { addDays, startOfDay, startOfWeekMonday, formatDayLabel } from '$lib/utils/calendar';
	import type {
		AppointmentStatus,
		AppointmentView,
		CalendarRange
	} from '$lib/types/appointments';

	const member = getMemberContext();
	const canViewAll = $derived(member().can_view_all_appointments);
	const canCreate = $derived(member().can_create_appointments);

	let view = $state<AppointmentView>('list');
	let range = $state<CalendarRange>('week');
	let anchor = $state<Date>(startOfWeekMonday(new Date()));
	let statusFilter = $state<AppointmentStatus | 'all'>('all');
	let assignedToFilter = $state<string | null>(null);
	let assignees = $state<{ id: string; full_name: string }[]>([]);

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
			view === 'calendar' && range === 'day' ? startOfDay(new Date()) : startOfWeekMonday(new Date());
	}

	const windowDays = $derived(view === 'list' ? 30 : range === 'day' ? 1 : 7);
	const windowStart = $derived(view === 'list' ? startOfDay(new Date()) : anchor);
	const windowEnd = $derived(addDays(windowStart, windowDays));

	const filters = $derived({
		from: windowStart.toISOString(),
		to: windowEnd.toISOString(),
		status: statusFilter,
		assignedTo: assignedToFilter
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
			<ViewToggle bind:view />
			{#if canCreate}
				<Button href="/appointments/new" size="sm" class="h-9">
					<CalendarPlus class="h-4 w-4" /> New
				</Button>
			{/if}
		</div>

		<div class="grid gap-2 sm:grid-cols-2">
			<div>
				<label for="status-filter" class="sr-only">Status</label>
				<select
					id="status-filter"
					bind:value={statusFilter}
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<option value="all">All statuses</option>
					<option value="scheduled">Scheduled</option>
					<option value="completed">Completed</option>
					<option value="cancelled">Cancelled</option>
					<option value="no_show">No-show</option>
				</select>
			</div>
			{#if canViewAll}
				<div>
					<label for="assignee-filter" class="sr-only">Assignee</label>
					<select
						id="assignee-filter"
						value={assignedToFilter ?? ''}
						onchange={(e) => (assignedToFilter = (e.currentTarget as HTMLSelectElement).value || null)}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="">All assignees</option>
						{#each assignees as a (a.id)}
							<option value={a.id}>{a.full_name}</option>
						{/each}
					</select>
				</div>
			{/if}
		</div>

		{#if view === 'calendar'}
			<div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
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
						onclick={() => setRange('day')}
					>Day</Button>
					<Button
						variant={range === 'week' ? 'default' : 'ghost'}
						size="sm"
						class="h-8"
						onclick={() => setRange('week')}
					>Week</Button>
				</div>
			</div>
		{/if}

		{#if showSkeleton}
			<SkeletonLoader lines={6} height="92px" label="Loading appointments" />
		{:else if showError}
			<p class="text-sm text-destructive">{errorMsg}</p>
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
				<CalendarWeekGrid {anchor} {items} />
			</div>
		{/if}
	</div>
</PageWrapper>
