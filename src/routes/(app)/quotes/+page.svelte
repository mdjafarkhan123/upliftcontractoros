<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import QuotesFilterTabs from '$lib/components/quotes/QuotesFilterTabs.svelte';
	import QuoteListItem from '$lib/components/quotes/QuoteListItem.svelte';
	import { quotesStore } from '$lib/stores/quotes.svelte';
	import type { QuotesGroup, QuotesStatusChip } from '$lib/types/quotes';
	import { FileText, Plus } from '@lucide/svelte';
	import { goto } from '$app/navigation';

	let group = $state<QuotesGroup>('all');
	let statusChip = $state<QuotesStatusChip>('all');
	const filters = $derived({ group, status: statusChip });

	$effect(() => {
		void quotesStore.load(filters);
	});

	const items = $derived(quotesStore.items);
	const nextCursor = $derived(quotesStore.nextCursor);
	const status = $derived(quotesStore.status);
	const errorMsg = $derived(quotesStore.error);
	const showSkeleton = $derived(status === 'loading' && items.length === 0);
	const showError = $derived(status === 'error' && items.length === 0);

	let loadingMore = $state(false);
	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		await quotesStore.loadMore(filters);
		loadingMore = false;
	}
</script>

<svelte:head><title>Quotes</title></svelte:head>

<PageWrapper title="Quotes" subtitle="Drafts, sent, viewed, accepted">
	{#snippet actions()}
		<Button onclick={() => goto('/quotes/new')}>
			<Plus class="mr-1 h-4 w-4" />New quote
		</Button>
	{/snippet}

	<div class="space-y-4">
		<QuotesFilterTabs bind:group bind:status={statusChip} />

		{#if showSkeleton}
			<SkeletonLoader lines={6} height="84px" label="Loading quotes" />
		{:else if showError}
			<p class="text-sm text-destructive">{errorMsg}</p>
		{:else if items.length === 0}
			<EmptyState
				icon={FileText}
				title="No quotes yet"
				description="Quotes you create will appear here. Send one to a customer to get started."
				actionLabel="New quote"
				onAction={() => goto('/quotes/new')}
			/>
		{:else}
			<ul class="grid gap-3">
				{#each items as quote (quote.id)}
					<li><QuoteListItem {quote} /></li>
				{/each}
			</ul>

			{#if nextCursor}
				<div class="flex justify-center pt-2">
					<Button variant="outline" disabled={loadingMore} onclick={loadMore}>
						{loadingMore ? 'Loading…' : 'Load more'}
					</Button>
				</div>
			{/if}
		{/if}
	</div>
</PageWrapper>
