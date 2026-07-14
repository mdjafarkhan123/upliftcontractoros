<script lang="ts">
	import KpiStrip, { type KpiTile } from '$lib/components/shared/KpiStrip.svelte';

	let {
		total,
		leads,
		customers,
		needsFollowUp,
		activeFollowUp = false,
		loading = false,
		onSelectStatus,
		onToggleFollowUp
	}: {
		total: number;
		leads: number;
		customers: number;
		needsFollowUp: number;
		activeFollowUp?: boolean;
		loading?: boolean;
		onSelectStatus?: (status: 'leads' | 'customers') => void;
		onToggleFollowUp?: () => void;
	} = $props();

	const tiles = $derived<KpiTile[]>([
		{ key: 'total', label: 'Total', value: total, icon: 'ri-group-line', tone: 'muted' },
		{
			key: 'leads',
			label: 'Leads',
			value: leads,
			icon: 'ri-user-add-line',
			tone: 'brand',
			onClick: onSelectStatus ? () => onSelectStatus('leads') : undefined
		},
		{
			key: 'customers',
			label: 'Customers',
			value: customers,
			icon: 'ri-user-follow-line',
			tone: 'success',
			onClick: onSelectStatus ? () => onSelectStatus('customers') : undefined
		},
		{
			key: 'followUp',
			label: 'Needs follow-up',
			value: needsFollowUp,
			icon: 'ri-calendar-schedule-line',
			tone: needsFollowUp > 0 ? 'warn' : 'muted',
			active: activeFollowUp,
			onClick: onToggleFollowUp ? () => onToggleFollowUp() : undefined
		}
	]);
</script>

<KpiStrip {tiles} {loading} ariaLabel="Contact stats" />
