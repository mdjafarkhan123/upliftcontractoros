<script lang="ts">
	import type { JobsFilterStatus, JobsStatusCounts } from '$lib/types/jobs';
	import KpiStrip, { type KpiTile, type KpiTone } from '$lib/components/shared/KpiStrip.svelte';

	// KPI tiles cover real work statuses only — 'all' and the 'deleted' recycle-bin
	// tab are not stat cards.
	type StatusKey = Exclude<JobsFilterStatus, 'all' | 'deleted'>;

	let {
		counts,
		loading = false,
		activeStatus = 'all',
		onSelect
	}: {
		counts: JobsStatusCounts;
		loading?: boolean;
		activeStatus?: JobsFilterStatus;
		onSelect?: (status: StatusKey) => void;
	} = $props();

	const META: { key: StatusKey; label: string; icon: string; tone: KpiTone }[] = [
		{ key: 'unscheduled', label: 'Unscheduled', icon: 'ri-calendar-todo-line', tone: 'muted' },
		{ key: 'upcoming', label: 'Upcoming', icon: 'ri-calendar-schedule-line', tone: 'info' },
		{ key: 'today', label: 'Today', icon: 'ri-calendar-event-line', tone: 'brand' },
		{ key: 'late', label: 'Late', icon: 'ri-alarm-warning-line', tone: 'warn' },
		{
			key: 'action_required',
			label: 'Action Required',
			icon: 'ri-error-warning-line',
			tone: 'warn'
		},
		{ key: 'completed', label: 'Completed', icon: 'ri-checkbox-circle-line', tone: 'success' },
		{ key: 'cancelled', label: 'Cancelled', icon: 'ri-close-circle-line', tone: 'muted' },
		// Money-state worklist (Jobber "Requires Invoicing") — the on-ramp to billing. Amber like the
		// row's "Needs Invoice" badge; it counts jobs that overlap the schedule tiles, so it reads as
		// an extra actionable number rather than a slice of the schedule breakdown.
		{ key: 'requires_invoicing', label: 'Requires Invoicing', icon: 'ri-bill-line', tone: 'warn' }
	];

	const tiles = $derived<KpiTile[]>(
		META.map((m) => ({
			key: m.key,
			label: m.label,
			value: counts[m.key],
			icon: m.icon,
			tone: m.tone,
			active: activeStatus === m.key,
			onClick: () => onSelect?.(m.key)
		}))
	);
</script>

<KpiStrip {tiles} {loading} ariaLabel="Job stats" />
