<script lang="ts">
	import { getGrowthTypeMeta } from '$lib/growth/typeRegistry';
	import Badge from '$lib/components/shared/Badge.svelte';
	import type { GrowthFeedItem } from '$lib/stores/growthFeed.svelte';

	let { item }: { item: GrowthFeedItem } = $props();

	let meta = $derived(getGrowthTypeMeta(item.type));
	let publishedLabel = $derived(
		new Date(item.published_at).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		})
	);
</script>

<article class="growth-card">
	<header class="growth-card__head">
		<Badge label={meta.label} variant="info" />
		<time class="growth-card__time" datetime={item.published_at}>
			{publishedLabel}
		</time>
	</header>

	<h3 class="growth-card__title">
		{item.title}
	</h3>

	<p class="growth-card__body">
		{item.body}
	</p>

	{#if item.media_url}
		<img src={item.media_url} alt="" loading="lazy" class="growth-card__media" />
	{/if}
</article>
