<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import type { JobStatus } from '$lib/types/jobs';
	import { deriveJobScheduleState, jobScheduleStateLabel } from '$lib/jobs/status';

	let {
		status,
		scheduledStart = undefined,
		class: className
	}: { status: JobStatus; scheduledStart?: string | null; class?: string } = $props();

	// Precise display state derived from the stored status + the job's date. See
	// $lib/jobs/status — Unscheduled/Upcoming/Today/Overdue are all faces of a 'scheduled' job.
	const state = $derived(deriveJobScheduleState(status, scheduledStart));

	const variant = $derived(
		state === 'completed'
			? 'success'
			: state === 'overdue' || state === 'cancelled'
				? 'danger'
				: state === 'today' || state === 'on_hold'
					? 'warning'
					: state === 'upcoming' || state === 'in_progress'
						? 'info'
						: 'default'
	);

	const label = $derived(jobScheduleStateLabel(state));
</script>

<Badge {variant} {label} class={className} />
