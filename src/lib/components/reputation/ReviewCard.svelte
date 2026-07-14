<script lang="ts">
	import type { ReviewListItem } from '$lib/types/reputation';
	import StarRating from './StarRating.svelte';

	let { review }: { review: ReviewListItem } = $props();

	const dateLabel = $derived(new Date(review.created_at).toLocaleDateString());
</script>

<article class="review-card">
	<div class="review-card__head">
		<div class="review-card__id">
			<p class="review-card__name">{review.contact_name}</p>
			{#if review.job_title}
				<p class="review-card__sub">{review.job_title}</p>
			{/if}
		</div>
		<StarRating score={review.score} size="md" />
	</div>
	{#if review.body}
		<p class="review-card__body">{review.body}</p>
	{/if}
	<p class="review-card__date">{dateLabel}</p>
</article>
