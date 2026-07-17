<script lang="ts">
	import KpiStrip, { type KpiTile } from '$lib/components/shared/KpiStrip.svelte';
	import { requestStatsStore } from '$lib/stores/requestStats.svelte';
	import type { RequestsFilterStatus } from '$lib/types/requests';

	let {
		activeStatus = 'all',
		onFilter
	}: {
		activeStatus?: RequestsFilterStatus;
		onFilter?: (status: RequestsFilterStatus) => void;
	} = $props();

	$effect(() => {
		void requestStatsStore.load();
	});

	const stats = $derived(requestStatsStore.data);
	const showSkeleton = $derived(requestStatsStore.status === 'loading' && !stats);

	// Click-to-filter tile (Contacts behavior): clicking the active tile clears
	// back to All.
	function tileClick(status: RequestsFilterStatus) {
		onFilter?.(activeStatus === status ? 'all' : status);
	}

	const trendHint = $derived.by(() => {
		if (!stats) return 'Past 30 days';
		const prev = stats.new_prev_30d;
		if (prev === 0) return 'Past 30 days';
		const pct = Math.round(((stats.new_past_30d - prev) / prev) * 100);
		return `Past 30 days · ${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}% vs prior`;
	});

	const tiles = $derived<KpiTile[]>([
		{
			key: 'needs_approval',
			label: 'Needs approval',
			value: stats?.needs_approval ?? 0,
			icon: 'ri-shield-check-line',
			tone: 'warn',
			hint: 'Waiting on your accept/decline',
			onClick: () => tileClick('needs_approval'),
			active: activeStatus === 'needs_approval'
		},
		{
			key: 'new',
			label: 'New',
			value: stats?.new ?? 0,
			icon: 'ri-inbox-2-line',
			tone: 'brand',
			hint: trendHint,
			onClick: () => tileClick('new'),
			active: activeStatus === 'new'
		},
		{
			key: 'unscheduled',
			label: 'Unscheduled',
			value: stats?.unscheduled ?? 0,
			icon: 'ri-calendar-todo-line',
			tone: 'warn',
			hint: 'Assessment has no date yet',
			onClick: () => tileClick('unscheduled'),
			active: activeStatus === 'unscheduled'
		},
		{
			key: 'overdue',
			label: 'Overdue',
			value: stats?.overdue ?? 0,
			icon: 'ri-alarm-warning-line',
			tone: 'warn',
			hint: 'Assessment date has passed',
			onClick: () => tileClick('overdue'),
			active: activeStatus === 'overdue'
		},
		{
			key: 'assessment_completed',
			label: 'Assessment complete',
			value: stats?.assessment_completed ?? 0,
			icon: 'ri-checkbox-circle-line',
			tone: 'success',
			hint: 'Ready to quote, book, or archive',
			onClick: () => tileClick('assessment_completed'),
			active: activeStatus === 'assessment_completed'
		},
		{
			key: 'conversion',
			label: 'Conversion rate',
			value: `${stats?.conversion_rate_30d ?? 0}%`,
			icon: 'ri-exchange-funds-line',
			tone: 'violet',
			hint: stats ? `${stats.new_past_30d} new · past 30 days` : 'Past 30 days'
		}
	]);
</script>

<KpiStrip {tiles} loading={showSkeleton} ariaLabel="Request stats" />
