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

<article
	class="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:p-5"
>
	<header class="flex items-center justify-between gap-2">
		<Badge label={meta.label} variant="info" />
		<time class="text-xs text-muted-foreground" datetime={item.published_at}>
			{publishedLabel}
		</time>
	</header>

	<h3 class="text-base font-semibold leading-snug text-foreground md:text-lg">
		{item.title}
	</h3>

	<p class="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
		{item.body}
	</p>

	{#if item.media_url}
		<img
			src={item.media_url}
			alt=""
			loading="lazy"
			class="mt-1 w-full rounded-lg border border-border object-cover"
		/>
	{/if}
</article>
