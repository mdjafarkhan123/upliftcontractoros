<script lang="ts">
	import type { GrowthFeedItem } from '$lib/stores/growthFeed.svelte';

	let { item }: { item: GrowthFeedItem } = $props();

	let publishedLabel = $derived(
		new Date(item.published_at).toLocaleDateString(undefined, {
			month: 'long',
			year: 'numeric'
		})
	);
</script>

<article class="growth-summary">
	<header class="growth-summary__head">
		<div class="growth-summary__eyebrow">
			<i class="ri-sparkling-2-line" aria-hidden="true"></i>
			<span>Monthly Summary</span>
		</div>
		<time class="growth-summary__time" datetime={item.published_at}>
			{publishedLabel}
		</time>
	</header>

	<h3 class="growth-summary__title">
		{item.title}
	</h3>

	<p class="growth-summary__body">
		{item.body}
	</p>

	{#if item.media_url}
		<img src={item.media_url} alt="" loading="lazy" class="growth-summary__media" />
	{/if}
</article>
