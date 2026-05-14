<script lang="ts">
	import type { PrivateFeedbackListItem } from '$lib/types/reputation';
	import StarRating from './StarRating.svelte';
	import { Badge } from '$lib/components/ui/badge';

	let { feedback }: { feedback: PrivateFeedbackListItem } = $props();

	const dateLabel = $derived(new Date(feedback.created_at).toLocaleDateString());
</script>

<a
	href={`/reputation/feedback/${feedback.id}`}
	class="block rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
>
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="truncate text-sm font-semibold text-foreground">{feedback.contact_name}</p>
			{#if feedback.job_title}
				<p class="truncate text-xs text-muted-foreground">{feedback.job_title}</p>
			{/if}
		</div>
		<div class="flex flex-col items-end gap-1.5">
			<StarRating score={feedback.score} size="md" />
			{#if feedback.is_resolved}
				<Badge variant="success">Resolved</Badge>
			{:else}
				<Badge variant="danger">Open</Badge>
			{/if}
		</div>
	</div>
	{#if feedback.body}
		<p class="mt-3 line-clamp-2 text-sm text-foreground/90">{feedback.body}</p>
	{/if}
	<p class="mt-3 text-xs text-muted-foreground">{dateLabel}</p>
</a>
