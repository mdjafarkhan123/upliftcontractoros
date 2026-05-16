<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import JobCard from '$lib/components/jobs/JobCard.svelte';
	import JobFilterTabs from '$lib/components/jobs/JobFilterTabs.svelte';
	import { jobsStore } from '$lib/stores/jobs.svelte';
	import type { JobsFilterStatus } from '$lib/types/jobs';
	import { Briefcase, X } from '@lucide/svelte';

	let statusFilter = $state<JobsFilterStatus>('all');

	const contactId = $derived(page.url.searchParams.get('contact_id'));
	const filters = $derived({
		status: statusFilter,
		assignedTo: null,
		contactId: contactId ?? null
	});

	$effect(() => {
		void jobsStore.load(filters);
	});

	const items = $derived(jobsStore.items);
	const nextCursor = $derived(jobsStore.nextCursor);
	const status = $derived(jobsStore.status);
	const errorMsg = $derived(jobsStore.error);
	const filterContext = $derived(jobsStore.filterContext);
	const showSkeleton = $derived(status === 'loading' && items.length === 0);
	const showError = $derived(status === 'error' && items.length === 0);

	let loadingMore = $state(false);
	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		await jobsStore.loadMore(filters);
		loadingMore = false;
	}

	function clearContactFilter() {
		goto('/jobs', { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>Jobs</title></svelte:head>

<PageWrapper
	title="Jobs"
	subtitle={contactId
		? 'Showing jobs related to this contact'
		: 'Track work from scheduled to complete'}
>
	<div class="space-y-4">
		{#if contactId && filterContext}
			<div
				class="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
			>
				<span class="text-muted-foreground">Active filter:</span>
				<span
					class="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-xs font-medium text-foreground ring-1 ring-border"
				>
					Contact: {filterContext.contact_name}
				</span>
				<button
					type="button"
					onclick={clearContactFilter}
					class="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<X class="h-3.5 w-3.5" />
					Clear filter
				</button>
			</div>
		{/if}

		<JobFilterTabs bind:value={statusFilter} />

		{#if showSkeleton}
			<SkeletonLoader lines={6} height="92px" label="Loading jobs" />
		{:else if showError}
			<p class="text-sm text-destructive">{errorMsg}</p>
		{:else if items.length === 0}
			{#if contactId}
				<EmptyState
					icon={Briefcase}
					title="No jobs found for this contact."
					description="Try clearing the filter to see all jobs."
					actionLabel="Clear filter"
					onAction={clearContactFilter}
				/>
			{:else}
				<EmptyState
					icon={Briefcase}
					title="No jobs yet"
					description={statusFilter === 'all'
						? 'Jobs are created automatically when an opportunity moves to Won.'
						: 'No jobs match this filter right now.'}
				/>
			{/if}
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
