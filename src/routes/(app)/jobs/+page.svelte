<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import JobCard from '$lib/components/jobs/JobCard.svelte';
	import JobFilterTabs from '$lib/components/jobs/JobFilterTabs.svelte';
	import { jobsStore } from '$lib/stores/jobs.svelte';
	import type { JobsFilterStatus } from '$lib/types/jobs';
	import { Briefcase } from '@lucide/svelte';

	let statusFilter = $state<JobsFilterStatus>('all');
	const filters = $derived({ status: statusFilter, assignedTo: null });

	$effect(() => {
		void jobsStore.load(filters);
	});

	const items = $derived(jobsStore.items);
	const nextCursor = $derived(jobsStore.nextCursor);
	const status = $derived(jobsStore.status);
	const errorMsg = $derived(jobsStore.error);
	const showSkeleton = $derived(status === 'loading' && items.length === 0);
	const showError = $derived(status === 'error' && items.length === 0);

	let loadingMore = $state(false);
	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		await jobsStore.loadMore(filters);
		loadingMore = false;
	}
</script>

<svelte:head><title>Jobs</title></svelte:head>

<PageWrapper title="Jobs" subtitle="Track work from scheduled to complete">
	<div class="space-y-4">
		<JobFilterTabs bind:value={statusFilter} />

		{#if showSkeleton}
			<SkeletonLoader lines={6} height="92px" label="Loading jobs" />
		{:else if showError}
			<p class="text-sm text-destructive">{errorMsg}</p>
		{:else if items.length === 0}
			<EmptyState
				icon={Briefcase}
				title="No jobs yet"
				description={statusFilter === 'all'
					? 'Jobs are created automatically when an opportunity moves to Won.'
					: 'No jobs match this filter right now.'}
			/>
		{:else}
			<ul class="grid gap-3">
				{#each items as job (job.id)}
					<li><JobCard {job} /></li>
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
