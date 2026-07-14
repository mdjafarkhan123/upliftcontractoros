<script lang="ts">
	import { reviewEventsStore } from '$lib/stores/reputation.svelte';
	import type { ReviewEventListItem, ReviewEventType } from '$lib/types/reputation';

	let { requestId }: { requestId: string } = $props();

	$effect(() => {
		void reviewEventsStore.load(requestId);
	});

	const events = $derived<ReviewEventListItem[]>(reviewEventsStore.get(requestId));
	const status = $derived(reviewEventsStore.getStatus(requestId));
	const error = $derived(reviewEventsStore.getError(requestId));

	function iconFor(type: ReviewEventType): string {
		switch (type) {
			case 'sent':
				return 'ri-send-plane-line';
			case 'link_opened':
				return 'ri-cursor-line';
			case 'rating_submitted':
				return 'ri-star-line';
			case 'redirected_to_google':
				return 'ri-external-link-line';
			case 'reminder_sent':
				return 'ri-notification-3-line';
			case 'nudge_sent':
				return 'ri-repeat-line';
			case 'expired':
				return 'ri-time-line';
			case 'attributed':
				return 'ri-award-line';
		}
	}

	function labelFor(e: ReviewEventListItem): string {
		switch (e.type) {
			case 'sent':
				return 'Initial text sent';
			case 'link_opened':
				return 'Customer opened the link';
			case 'rating_submitted':
				return e.rating !== null ? `Rated ${e.rating}★` : 'Rating submitted';
			case 'redirected_to_google':
				return 'Sent to Google review page';
			case 'reminder_sent':
				return 'Reminder sent (72h)';
			case 'nudge_sent':
				return e.nudge_number ? `Nudge ${e.nudge_number} sent` : 'Nudge sent';
			case 'expired':
				return 'Window expired — no response';
			case 'attributed':
				return e.confidence_score !== null
					? `Review attributed · ${Math.round(e.confidence_score * 100)}% confidence`
					: 'Review attributed';
		}
	}

	function toneFor(type: ReviewEventType): string {
		switch (type) {
			case 'attributed':
				return 'request-event__dot--success';
			case 'expired':
				return 'request-event__dot--danger';
			case 'nudge_sent':
			case 'reminder_sent':
				return 'request-event__dot--warning';
			default:
				return '';
		}
	}

	function relative(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const min = 60_000;
		const hr = 60 * min;
		const day = 24 * hr;
		if (diff < min) return 'just now';
		if (diff < hr) return `${Math.floor(diff / min)}m ago`;
		if (diff < day) return `${Math.floor(diff / hr)}h ago`;
		if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
		return new Date(iso).toLocaleDateString();
	}
</script>

<div class="request-timeline">
	{#if status === 'loading' && events.length === 0}
		<div class="request-timeline__loading">
			{#each [0, 1, 2] as i (i)}
				<div class="request-timeline__loading-row">
					<div class="request-timeline__loading-dot skeleton-shimmer"></div>
					<div class="request-timeline__loading-bar skeleton-shimmer"></div>
				</div>
			{/each}
		</div>
	{:else if error && events.length === 0}
		<p class="request-timeline__msg">Couldn't load timeline. {error}</p>
	{:else if events.length === 0}
		<p class="request-timeline__msg">No events recorded yet.</p>
	{:else}
		<ol class="request-timeline__list">
			<!-- vertical guide line -->
			<span class="request-timeline__guide" aria-hidden="true"></span>
			{#each events as e (e.id)}
				<li class="request-event">
					<span class="request-event__dot {toneFor(e.type)}">
						<i class={iconFor(e.type)} aria-hidden="true"></i>
					</span>
					<div class="request-event__main">
						<p class="request-event__label">{labelFor(e)}</p>
						<p class="request-event__time" title={e.created_at}>
							{relative(e.created_at)}
						</p>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</div>
