<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import type { JobStatus } from '$lib/types/jobs';
	import { deriveJobScheduleState, jobScheduleStateLabel } from '$lib/jobs/status';

	let {
		status,
		scheduledStart = undefined,
		hasSeriesAnchor = false,
		nextOpenVisitStart = undefined,
		hasOpenVisits = undefined,
		completedAt = undefined,
		cancelledAt = undefined,
		class: className
	}: {
		status: JobStatus;
		scheduledStart?: string | null;
		// TRUE when scheduledStart is a frozen series anchor / job window rather than a real visit
		// date, which is the case for any job carrying a repeat rule (either type — a one-off may
		// repeat) or an "as needed" job. It suppresses the scheduledStart fallback below.
		hasSeriesAnchor?: boolean;
		// Visit-truth signals (list/detail supply them). When omitted, the badge falls back to the
		// job's own date — correct only for a single-visit job, whose scheduled_start tracks it.
		nextOpenVisitStart?: string | null;
		hasOpenVisits?: boolean;
		// Close timestamps — read only for an `archived` job to show Completed vs Cancelled. When
		// omitted, an archived job simply reads "Closed".
		completedAt?: string | null;
		cancelledAt?: string | null;
		class?: string;
	} = $props();

	// Precise display state derived from the stored status + the job's OPEN visits. See
	// $lib/jobs/status — Unscheduled/Upcoming/Today/Late/Action Required are faces of an `active`
	// job (driven by the next open visit); Completed/Cancelled are faces of an `archived` job.
	const state = $derived(
		deriveJobScheduleState({
			status,
			hasSeriesAnchor,
			scheduledStart,
			nextOpenVisitStart,
			hasOpenVisits,
			completedAt,
			cancelledAt
		})
	);

	const variant = $derived(
		state === 'completed'
			? 'success'
			: state === 'late' || state === 'cancelled'
				? 'danger'
				: state === 'today' || state === 'action_required'
					? 'warning'
					: state === 'upcoming'
						? 'info'
						: 'default'
	);

	const label = $derived(jobScheduleStateLabel(state));
</script>

<Badge {variant} {label} class={className} />
