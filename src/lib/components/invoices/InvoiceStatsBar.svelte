<script lang="ts">
	import { formatCurrency } from '$lib/utils/format';
	import { invoiceStatsStore } from '$lib/stores/invoiceStats.svelte';
	import KpiStrip, { type KpiTile } from '$lib/components/shared/KpiStrip.svelte';

	$effect(() => {
		void invoiceStatsStore.load();
	});

	const stats = $derived(invoiceStatsStore.data);
	const status = $derived(invoiceStatsStore.status);
	const showSkeleton = $derived(status === 'loading' && !stats);

	const avgDays = $derived(
		stats?.avg_days_to_pay != null
			? stats.avg_days_to_pay < 1
				? '<1'
				: String(Math.round(stats.avg_days_to_pay))
			: '—'
	);

	const overdueCount = $derived(stats?.overdue_count ?? 0);

	const tiles = $derived<KpiTile[]>([
		{
			key: 'outstanding',
			label: 'Outstanding',
			value: formatCurrency(stats?.outstanding_total ?? 0),
			icon: 'ri-money-dollar-circle-line',
			tone: 'brand',
			hint: 'Unpaid, sent to clients'
		},
		{
			key: 'overdue',
			label: 'Overdue',
			value: formatCurrency(stats?.overdue_total ?? 0),
			icon: 'ri-error-warning-line',
			tone: 'warn',
			hint:
				overdueCount > 0
					? `${overdueCount} invoice${overdueCount === 1 ? '' : 's'} past due`
					: 'Nothing past due'
		},
		{
			key: 'paid',
			label: 'Paid this month',
			value: formatCurrency(stats?.paid_this_month ?? 0),
			icon: 'ri-checkbox-circle-line',
			tone: 'success',
			hint: 'Collected this month'
		},
		{
			key: 'avg',
			label: 'Avg days to pay',
			value: avgDays,
			icon: 'ri-timer-line',
			tone: 'violet',
			hint: 'From sent to paid · last 90 days'
		}
	]);
</script>

<KpiStrip {tiles} loading={showSkeleton} ariaLabel="Invoice stats" />
