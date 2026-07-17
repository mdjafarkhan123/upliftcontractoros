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
			? counts.pending +
					counts.upcoming +
					counts.today +
					counts.overdue +
					counts.action_required +
					counts.in_progress +
					counts.on_hold +
					counts.completed +
					counts.cancelled
			: 0
	);

	const tabs = $derived<ListTab<JobsFilterStatus>[]>([
		{ value: 'all', label: 'All', count: total },
		{ value: 'pending', label: 'Unscheduled', count: counts?.pending },
		{ value: 'upcoming', label: 'Upcoming', count: counts?.upcoming },
		{ value: 'today', label: 'Today', count: counts?.today },
		{ value: 'overdue', label: 'Overdue', count: counts?.overdue },
		{ value: 'action_required', label: 'Action Required', count: counts?.action_required },
		{ value: 'in_progress', label: 'In Progress', count: counts?.in_progress },
		{ value: 'on_hold', label: 'On Hold', count: counts?.on_hold },
		{ value: 'completed', label: 'Completed', count: counts?.completed },
		{ value: 'cancelled', label: 'Cancelled', count: counts?.cancelled },
		{ value: 'deleted', label: 'Deleted' }
	]);
</script>

<ListTabs {tabs} bind:value {onChange} ariaLabel="Filter jobs by status" />
