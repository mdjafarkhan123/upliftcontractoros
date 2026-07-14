<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import GrowthFeedCard from '$lib/components/growth/GrowthFeedCard.svelte';
	import MonthlySummaryCard from '$lib/components/growth/MonthlySummaryCard.svelte';
	import { growthFeedStore } from '$lib/stores/growthFeed.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';

	const member = getMemberContext();
	const featureFlags = getFeatureFlagsContext();

	let m = $derived(member());
	let flags = $derived(featureFlags());

	let canSee = $derived(flags.feature_growth_feed && m.can_view_growth_feed);

	let monthlySummaries = $derived(growthFeedStore.items.filter((i) => i.is_monthly_summary));
	let regularItems = $derived(growthFeedStore.items.filter((i) => !i.is_monthly_summary));

	onMount(() => {
		if (canSee) void growthFeedStore.load();
	});
</script>

<svelte:head><title>Growth</title></svelte:head>

<PageWrapper title="Growth" subtitle="What your agency has been working on">
	{#if !canSee}
		<EmptyState
			iconClass="ri-sparkling-2-line"
			title="Growth feed isn’t available"
			description="Your agency hasn’t turned on growth activities for your account yet."
		/>
	{:else if growthFeedStore.status === 'loading'}
		<div class="growth__group">
			<SkeletonLoader lines={6} label="Loading growth feed" height="80px" />
		</div>
	{:else if growthFeedStore.status === 'error'}
		<EmptyState
			iconClass="ri-sparkling-2-line"
			title="Couldn’t load growth feed"
			description={growthFeedStore.error ?? 'Please try again.'}
			actionLabel="Retry"
			onAction={() => growthFeedStore.load(true)}
		/>
	{:else if growthFeedStore.items.length === 0}
		<EmptyState
			iconClass="ri-sparkling-2-line"
			title="Nothing here yet"
			description="Your agency is setting up your growth activities."
		/>
	{:else}
		<div class="growth">
			{#if monthlySummaries.length > 0}
				<section class="growth__group">
					{#each monthlySummaries as item (item.id)}
						<MonthlySummaryCard {item} />
					{/each}
				</section>
			{/if}

			{#if regularItems.length > 0}
				<section class="growth__group">
					{#each regularItems as item (item.id)}
						<GrowthFeedCard {item} />
					{/each}
				</section>
			{/if}

			{#if growthFeedStore.nextCursor}
				<div class="growth__more">
					<Button type="button" variant="outline" onclick={() => growthFeedStore.loadMore()}>
						Load more
					</Button>
				</div>
			{/if}
		</div>
	{/if}
</PageWrapper>
