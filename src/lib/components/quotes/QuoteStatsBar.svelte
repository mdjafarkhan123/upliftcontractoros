<script lang="ts">
	import { formatCurrency } from '$lib/utils/format';
	import { quoteStatsStore } from '$lib/stores/quoteStats.svelte';
	import KpiStrip, { type KpiTile } from '$lib/components/shared/KpiStrip.svelte';

	$effect(() => {
		void quoteStatsStore.load();
	});

	const stats = $derived(quoteStatsStore.data);
	const status = $derived(quoteStatsStore.status);
	const showSkeleton = $derived(status === 'loading' && !stats);

	const acceptancePct = $derived(
		stats?.acceptance_rate != null ? `${Math.round(stats.acceptance_rate * 100)}%` : '—'
	);
	const avgDays = $derived(
		stats?.avg_days_to_accept != null
			? stats.avg_days_to_accept < 1
				? '<1'
				: String(Math.round(stats.avg_days_to_accept))
			: '—'
	);

	const tiles = $derived<KpiTile[]>([
		{
			key: 'awaiting',
			label: 'Awaiting response',
			value: stats?.awaiting_count ?? 0,
			icon: 'ri-time-line',
			tone: 'info',
			hint: 'Sent or viewed, no reply yet'
		},
		{
			key: 'open',
			label: 'Open value',
			value: formatCurrency(stats?.open_value ?? 0),
			icon: 'ri-money-dollar-circle-line',
			tone: 'brand',
			hint: 'Quotes live with clients'
		},
		{
			key: 'rate',
			label: 'Acceptance rate',
			value: acceptancePct,
			icon: 'ri-checkbox-circle-line',
			tone: 'success',
			hint:
				stats && stats.decided_90 > 0
					? `${stats.accepted_90} of ${stats.decided_90} decided · last 90 days`
					: 'Last 90 days'
		},
		{
			key: 'avg',
			label: 'Avg days to accept',
			value: avgDays,
			icon: 'ri-timer-line',
			tone: 'violet',
			hint: 'From sent to accepted · last 90 days'
		}
	]);
</script>

<KpiStrip {tiles} loading={showSkeleton} ariaLabel="Quote stats" />
