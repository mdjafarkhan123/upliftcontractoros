<script lang="ts">
	import { Sparkles } from '@lucide/svelte';
	import type { GrowthFeedItem } from '$lib/stores/growthFeed.svelte';

	let { item }: { item: GrowthFeedItem } = $props();

	let publishedLabel = $derived(
		new Date(item.published_at).toLocaleDateString(undefined, {
			month: 'long',
			year: 'numeric'
		})
	);
</script>

<article
	class="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 shadow-sm md:p-6"
>
	<header class="flex items-center justify-between gap-2">
		<div class="flex items-center gap-2 text-primary">
			<Sparkles class="h-4 w-4" />
			<span class="text-xs font-semibold uppercase tracking-wide">Monthly Summary</span>
		</div>
		<time class="text-xs text-muted-foreground" datetime={item.published_at}>
			{publishedLabel}
		</time>
	</header>

	<h3 class="text-lg font-semibold leading-snug text-foreground md:text-xl">
		{item.title}
	</h3>

	<p class="whitespace-pre-line text-sm leading-relaxed text-foreground/80">
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
