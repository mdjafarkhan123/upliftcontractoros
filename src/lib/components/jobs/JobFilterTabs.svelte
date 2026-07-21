<script lang="ts">
	import type { JobsFilterStatus, JobsStatusCounts } from '$lib/types/jobs';
	import ListTabs, { type ListTab } from '$lib/components/shared/ListTabs.svelte';

	let {
		value = $bindable<JobsFilterStatus>('all'),
		counts = null,
		onChange
	}: {
		value?: JobsFilterStatus;
		counts?: JobsStatusCounts | null;
		onChange?: (next: JobsFilterStatus) => void;
	} = $props();

	const total = $derived(
		counts
			? counts.unscheduled +
					counts.upcoming +
					counts.today +
					counts.late +
					counts.action_required +
					counts.completed +
					counts.cancelled
			: 0
	);

	const tabs = $derived<ListTab<JobsFilterStatus>[]>([
		{ value: 'all', label: 'All', count: total },
		{ value: 'unscheduled', label: 'Unscheduled', count: counts?.unscheduled },
		{ value: 'upcoming', label: 'Upcoming', count: counts?.upcoming },
		{ value: 'today', label: 'Today', count: counts?.today },
		{ value: 'late', label: 'Late', count: counts?.late },
		{ value: 'action_required', label: 'Action Required', count: counts?.action_required },
		{ value: 'completed', label: 'Completed', count: counts?.completed },
		{ value: 'cancelled', label: 'Cancelled', count: counts?.cancelled },
		{ value: 'deleted', label: 'Deleted' }
	]);
</script>

<ListTabs {tabs} bind:value {onChange} ariaLabel="Filter jobs by status" />
