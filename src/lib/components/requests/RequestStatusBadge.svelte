<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import type { RequestDerivedStatus } from '$lib/types/requests';

	let {
		status,
		class: className
	}: { status: RequestDerivedStatus; class?: string } = $props();

	const LABELS: Record<RequestDerivedStatus, string> = {
		needs_approval: 'Needs approval',
		new: 'New',
		unscheduled: 'Unscheduled',
		upcoming: 'Upcoming',
		today: 'Today',
		overdue: 'Overdue',
		assessment_completed: 'Assessment complete',
		converted: 'Converted',
		archived: 'Archived'
	};

	const variant = $derived(
		status === 'overdue'
			? 'danger'
			: status === 'today' || status === 'unscheduled' || status === 'needs_approval'
				? 'warning'
				: status === 'assessment_completed' || status === 'converted'
					? 'success'
					: status === 'upcoming' || status === 'new'
						? 'info'
						: 'default'
	);
</script>

<Badge {variant} label={LABELS[status]} class={className} />
