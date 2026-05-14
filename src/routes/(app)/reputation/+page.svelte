<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Star, MessageSquareWarning, Send } from '@lucide/svelte';
	import ReputationStats from '$lib/components/reputation/ReputationStats.svelte';
	import ReviewCard from '$lib/components/reputation/ReviewCard.svelte';
	import PrivateFeedbackCard from '$lib/components/reputation/PrivateFeedbackCard.svelte';
	import ReviewRequestRow from '$lib/components/reputation/ReviewRequestRow.svelte';
	import {
		reviewsStore,
		privateFeedbackStore,
		reviewRequestsStore,
		reputationSummaryStore
	} from '$lib/stores/reputation.svelte';
	import { getMemberContext } from '$lib/context/member';

	const member = getMemberContext();
	const canViewReviews = $derived(member().can_view_reviews);
	const canViewNegative = $derived(member().can_view_negative_feedback);

	type Tab = 'reviews' | 'negative' | 'requests';
	let tab = $state<Tab>('reviews');

	$effect(() => {
		if (!canViewReviews) return;
		void reputationSummaryStore.load();
		void reviewsStore.load();
	});

	$effect(() => {
		if (tab === 'negative' && canViewNegative) void privateFeedbackStore.load();
		if (tab === 'requests' && canViewReviews) void reviewRequestsStore.load();
	});

	const summary = $derived(reputationSummaryStore.summary);
	const reviews = $derived(reviewsStore.items);
	const reviewsStatus = $derived(reviewsStore.status);
	const negative = $derived(privateFeedbackStore.items);
	const negativeStatus = $derived(privateFeedbackStore.status);
	const requests = $derived(reviewRequestsStore.items);
	const requestsStatus = $derived(reviewRequestsStore.status);
</script>

<svelte:head><title>Reputation</title></svelte:head>

<PageWrapper title="Reputation" subtitle="Reviews, feedback, and review requests">
	{#if !canViewReviews}
		<EmptyState
			icon={Star}
			title="No access"
			description="You don't have permission to view reputation data."
		/>
	{:else}
		<div class="space-y-5">
			{#if summary}
				<ReputationStats {summary} />
			{:else if reputationSummaryStore.status === 'loading'}
				<SkeletonLoader lines={1} height="92px" label="Loading stats" />
			{/if}

			<Tabs.Root value={tab} onValueChange={(v) => (tab = v as Tab)}>
				<Tabs.List class="w-full">
					<Tabs.Trigger value="reviews" class="flex-1">Reviews</Tabs.Trigger>
					{#if canViewNegative}
						<Tabs.Trigger value="negative" class="flex-1">Negative</Tabs.Trigger>
					{/if}
					<Tabs.Trigger value="requests" class="flex-1">Requests</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="reviews" class="mt-4">
					{#if reviewsStatus === 'loading' && reviews.length === 0}
						<SkeletonLoader lines={5} height="92px" label="Loading reviews" />
					{:else if reviews.length === 0}
						<EmptyState
							icon={Star}
							title="No reviews yet"
							description="Positive customer responses will appear here."
						/>
					{:else}
						<ul class="grid gap-3">
							{#each reviews as r (r.id)}
								<li><ReviewCard review={r} /></li>
							{/each}
						</ul>
					{/if}
				</Tabs.Content>

				{#if canViewNegative}
					<Tabs.Content value="negative" class="mt-4">
						{#if negativeStatus === 'loading' && negative.length === 0}
							<SkeletonLoader lines={5} height="92px" label="Loading feedback" />
						{:else if negative.length === 0}
							<EmptyState
								icon={MessageSquareWarning}
								title="No negative feedback"
								description="Private feedback from customers will appear here."
							/>
						{:else}
							<ul class="grid gap-3">
								{#each negative as f (f.id)}
									<li><PrivateFeedbackCard feedback={f} /></li>
								{/each}
							</ul>
						{/if}
					</Tabs.Content>
				{/if}

				<Tabs.Content value="requests" class="mt-4">
					{#if requestsStatus === 'loading' && requests.length === 0}
						<SkeletonLoader lines={5} height="92px" label="Loading requests" />
					{:else if requests.length === 0}
						<EmptyState
							icon={Send}
							title="No review requests yet"
							description="Requests sent to customers — automatic and manual — will appear here."
						/>
					{:else}
						<ul class="grid gap-3">
							{#each requests as r (r.id)}
								<li><ReviewRequestRow request={r} /></li>
							{/each}
						</ul>
					{/if}
				</Tabs.Content>
			</Tabs.Root>
		</div>
	{/if}
</PageWrapper>
