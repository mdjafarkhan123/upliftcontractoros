<script lang="ts">
	import {
		Send,
		MousePointerClick,
		Star,
		ExternalLink,
		Bell,
		Repeat,
		Clock,
		Award
	} from '@lucide/svelte';
	import { reviewEventsStore } from '$lib/stores/reputation.svelte';
	import type { ReviewEventListItem, ReviewEventType } from '$lib/types/reputation';

	let { requestId }: { requestId: string } = $props();

	$effect(() => {
		void reviewEventsStore.load(requestId);
	});

	const events = $derived<ReviewEventListItem[]>(reviewEventsStore.get(requestId));
	const status = $derived(reviewEventsStore.getStatus(requestId));
	const error = $derived(reviewEventsStore.getError(requestId));

	function iconFor(type: ReviewEventType) {
		switch (type) {
			case 'sent':
				return Send;
			case 'link_opened':
				return MousePointerClick;
			case 'rating_submitted':
				return Star;
			case 'redirected_to_google':
				return ExternalLink;
			case 'reminder_sent':
				return Bell;
			case 'nudge_sent':
				return Repeat;
			case 'expired':
				return Clock;
			case 'attributed':
				return Award;
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
				return 'text-emerald-600 dark:text-emerald-400';
			case 'expired':
				return 'text-rose-600 dark:text-rose-400';
			case 'nudge_sent':
			case 'reminder_sent':
				return 'text-amber-600 dark:text-amber-400';
			default:
				return 'text-muted-foreground';
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

<div class="mt-3 border-t border-border pt-3">
	{#if status === 'loading' && events.length === 0}
		<div class="space-y-2">
			{#each [0, 1, 2] as i (i)}
				<div class="flex items-center gap-2">
					<div class="h-6 w-6 animate-pulse rounded-full bg-muted"></div>
					<div class="h-3 flex-1 animate-pulse rounded bg-muted"></div>
				</div>
			{/each}
		</div>
	{:else if error && events.length === 0}
		<p class="text-xs text-muted-foreground">Couldn't load timeline. {error}</p>
	{:else if events.length === 0}
		<p class="text-xs text-muted-foreground">No events recorded yet.</p>
	{:else}
		<ol class="relative space-y-3">
			<!-- vertical guide line -->
			<span class="absolute left-[11px] top-1 bottom-1 w-px bg-border" aria-hidden="true"></span>
			{#each events as e (e.id)}
				{@const Icon = iconFor(e.type)}
				<li class="relative flex items-start gap-3 pl-0">
					<span
						class="relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-muted ring-2 ring-card {toneFor(
							e.type
						)}"
					>
						<Icon class="h-3 w-3" />
					</span>
					<div class="min-w-0 flex-1 pt-0.5">
						<p class="text-xs font-medium text-foreground">{labelFor(e)}</p>
						<p class="text-[11px] text-muted-foreground tabular-nums" title={e.created_at}>
							{relative(e.created_at)}
						</p>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</div>
