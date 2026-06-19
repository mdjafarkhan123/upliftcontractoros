<script lang="ts">
	import type { ReviewRequestListItem } from '$lib/types/reputation';
	import { Badge } from '$lib/components/ui/badge';
	import { ChevronDown } from '@lucide/svelte';
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

<article class="rounded-xl border border-border bg-card p-4 shadow-sm">
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<a
				href="/jobs/{request.job_id}"
				use:prefetchOnIntent={() => jobDetailStore.prefetch(request.job_id)}
				class="block truncate text-sm font-semibold text-foreground hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-none"
			>
				{request.job_title ?? 'Untitled job'}
			</a>
			<a
				href="/contacts/{request.contact_id}"
				class="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:outline-none"
			>
				{request.contact_name}
			</a>
		</div>
		<div class="flex shrink-0 items-center gap-1">
			<Badge variant={statusVariant}>{statusLabel}</Badge>
			<ReviewRequestRowActions {request} {displayStatus} />
		</div>
	</div>

	{#if request.submitted_rating !== null}
		<div class="mt-3"><StarRating score={request.submitted_rating} size="md" /></div>
	{/if}

	<div class="mt-3 flex items-center justify-between gap-3">
		<p class="text-xs text-muted-foreground">
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
			class="inline-flex h-8 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
		>
			<span>{expanded ? 'Hide' : 'Timeline'}</span>
			<ChevronDown
				class="h-3.5 w-3.5 transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
			/>
		</button>
	</div>

	{#if expanded}
		<ReviewRequestTimeline requestId={request.id} />
	{/if}
</article>
