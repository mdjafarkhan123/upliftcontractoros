<script lang="ts">
	import type { PrivateFeedbackListItem } from '$lib/types/reputation';
	import StarRating from './StarRating.svelte';
	import { Badge } from '$lib/components/ui/badge';

	let { feedback }: { feedback: PrivateFeedbackListItem } = $props();

	const dateLabel = $derived(new Date(feedback.created_at).toLocaleDateString());
</script>

<a href={`/reputation/feedback/${feedback.id}`} class="feedback-card">
	<div class="feedback-card__head">
		<div class="feedback-card__id">
			<p class="feedback-card__name">{feedback.contact_name}</p>
			{#if feedback.job_title}
				<p class="feedback-card__sub">{feedback.job_title}</p>
			{/if}
		</div>
		<div class="feedback-card__meta">
			<StarRating score={feedback.score} size="md" />
			{#if feedback.is_resolved}
				<Badge variant="success">Resolved</Badge>
			{:else}
				<Badge variant="danger">Open</Badge>
			{/if}
		</div>
	</div>
	{#if feedback.body}
		<p class="feedback-card__body">{feedback.body}</p>
	{/if}
	<p class="feedback-card__date">{dateLabel}</p>
</a>
