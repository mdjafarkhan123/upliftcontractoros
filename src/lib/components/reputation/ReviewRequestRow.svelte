<script lang="ts">
	import type { ReviewRequestListItem } from '$lib/types/reputation';
	import { Badge } from '$lib/components/ui/badge';
	import StarRating from './StarRating.svelte';
	import ReviewRequestRowActions from './ReviewRequestRowActions.svelte';
	import ReviewRequestTimeline from './ReviewRequestTimeline.svelte';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { jobDetailStore } from '$lib/stores/jobDetail.svelte';

	let { request }: { request: ReviewRequestListItem } = $props();

	let expanded = $state(false);

	const displayStatus = $derived(
		(request.status === 'sent' || request.status === 'engaged') && request.is_expired
			? 'expired'
			: request.status
	);

	const statusLabel = $derived(
		displayStatus === 'scheduled'
			? 'Scheduled'
			: displayStatus === 'sent'
				? 'Sent · waiting'
				: displayStatus === 'engaged'
					? request.nudge_count === 0
						? 'Engaged · awaiting Google'
						: `Engaged · nudged ${request.nudge_count}×`
					: displayStatus === 'likely_reviewed'
						? 'Likely reviewed'
						: displayStatus === 'completed_internal'
							? 'Internal feedback'
							: 'Expired · no response'
	);

	const statusVariant = $derived<'success' | 'danger' | 'default'>(
		displayStatus === 'likely_reviewed'
			? 'success'
			: displayStatus === 'expired' || displayStatus === 'completed_internal'
				? 'danger'
				: 'default'
	);

	const primaryDate = $derived(
		request.attributed_at ??
			request.completed_at ??
			request.expired_at ??
			request.engaged_at ??
			request.sent_at ??
			request.created_at
	);
	const dateLabel = $derived(new Date(primaryDate).toLocaleDateString());
</script>

<article class="request-row">
	<div class="request-row__head">
		<div class="request-row__id">
			<a
				href="/jobs/{request.job_id}"
				use:prefetchOnIntent={() => jobDetailStore.prefetch(request.job_id)}
				class="request-row__job"
			>
				{request.job_title ?? 'Untitled job'}
			</a>
			<a href="/contacts/{request.contact_id}" class="request-row__contact">
				{request.contact_name}
			</a>
		</div>
		<div class="request-row__actions">
			<Badge variant={statusVariant}>{statusLabel}</Badge>
			<ReviewRequestRowActions {request} {displayStatus} />
		</div>
	</div>

	{#if request.submitted_rating !== null}
		<div class="request-row__rating"><StarRating score={request.submitted_rating} size="md" /></div>
	{/if}

	<div class="request-row__foot">
		<p class="request-row__meta">
			{request.sent_by_automation ? 'Automated' : 'Manual'} · {dateLabel}
			{#if displayStatus === 'likely_reviewed' && request.confidence_score !== null}
				· Confidence {Math.round(request.confidence_score * 100)}%
			{/if}
		</p>
		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
			aria-label={expanded ? 'Hide timeline' : 'Show timeline'}
			class="request-row__toggle"
		>
			<span>{expanded ? 'Hide' : 'Timeline'}</span>
			<i
				class="ri-arrow-down-s-line request-row__chevron"
				class:request-row__chevron--open={expanded}
				aria-hidden="true"
			></i>
		</button>
	</div>

	{#if expanded}
		<ReviewRequestTimeline requestId={request.id} />
	{/if}
</article>
