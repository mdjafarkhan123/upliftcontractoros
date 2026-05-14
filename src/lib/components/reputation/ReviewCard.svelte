<script lang="ts">
	import type { ReviewListItem } from '$lib/types/reputation';
	import StarRating from './StarRating.svelte';

	let { review }: { review: ReviewListItem } = $props();

	const dateLabel = $derived(new Date(review.created_at).toLocaleDateString());
</script>

<article class="rounded-xl border border-border bg-card p-4 shadow-sm">
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="truncate text-sm font-semibold text-foreground">{review.contact_name}</p>
			{#if review.job_title}
				<p class="truncate text-xs text-muted-foreground">{review.job_title}</p>
			{/if}
		</div>
		<StarRating score={review.score} size="md" />
	</div>
	{#if review.body}
		<p class="mt-3 text-sm text-foreground/90">{review.body}</p>
	{/if}
	<p class="mt-3 text-xs text-muted-foreground">{dateLabel}</p>
</article>
