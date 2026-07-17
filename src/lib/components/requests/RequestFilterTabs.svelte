<script lang="ts">
	import ListTabs, { type ListTab } from '$lib/components/shared/ListTabs.svelte';
	import type { RequestsFilterStatus } from '$lib/types/requests';

	let {
		status = $bindable<RequestsFilterStatus>('all')
	}: {
		status?: RequestsFilterStatus;
	} = $props();

	// One flat underline row (Jobber requests pattern). Status is DERIVED
	// server-side; 'upcoming' also matches 'today'.
	const tabs: ListTab<RequestsFilterStatus>[] = [
		{ value: 'all', label: 'All' },
		{ value: 'needs_approval', label: 'Needs approval' },
		{ value: 'new', label: 'New' },
		{ value: 'unscheduled', label: 'Unscheduled' },
		{ value: 'upcoming', label: 'Upcoming' },
		{ value: 'overdue', label: 'Overdue' },
		{ value: 'assessment_completed', label: 'Completed' },
		{ value: 'converted', label: 'Converted' },
		{ value: 'archived', label: 'Archived' }
	];
</script>

<ListTabs {tabs} value={status} onChange={(v) => (status = v)} ariaLabel="Filter requests by status" />
