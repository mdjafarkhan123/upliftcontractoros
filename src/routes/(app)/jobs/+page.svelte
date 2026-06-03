<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import JobCard from '$lib/components/jobs/JobCard.svelte';
	import JobFilterTabs from '$lib/components/jobs/JobFilterTabs.svelte';
	import JobStatsCards, { type JobStatsKey } from '$lib/components/jobs/JobStatsCards.svelte';
	import NewJobSheet from '$lib/components/jobs/NewJobSheet.svelte';
	import { jobsStore } from '$lib/stores/jobs.svelte';
	import type { JobsFilterScope, JobsFilterStatus, JobsStats } from '$lib/types/jobs';
	import { Briefcase, Plus, X } from '@lucide/svelte';
	import { getMemberContext } from '$lib/context/member';
	import { onMount } from 'svelte';

	const member = getMemberContext();
	const canCreate = $derived(member().can_view_full_pipeline);

	let statusFilter = $state<JobsFilterStatus>('all');
	let scopeFilter = $state<JobsFilterScope | null>(null);
	let newOpen = $state(false);
	let assignees = $state<{ id: string; full_name: string }[]>([]);
	let stats = $state<JobsStats | null>(null);
	let statsLoading = $state(true);

	async function loadStats() {
		statsLoading = stats === null;
		try {
			const res = await fetch('/api/jobs/stats');
			if (res.ok) {
				const body = (await res.json()) as { data: JobsStats };
				stats = body.data;
			}
		} finally {
			statsLoading = false;
		}
	}

	onMount(async () => {
		void loadStats();
		if (!canCreate) return;
		const res = await fetch('/api/contacts/assignees');
		if (res.ok) {
			const a = (await res.json()) as { assignees: { id: string; full_name: string }[] };
			assignees = a.assignees;
		}
	});

	const activeStatsKey = $derived<JobStatsKey | null>(
		scopeFilter ?? (statusFilter === 'in_progress' ? 'in_progress' : null)
	);

	function selectStatsCard(next: JobStatsKey) {
		if (activeStatsKey === next) {
			scopeFilter = null;
			statusFilter = 'all';
			return;
		}
		if (next === 'in_progress') {
			scopeFilter = null;
			statusFilter = 'in_progress';
		} else {
			scopeFilter = next;
			statusFilter = 'all';
		}
	}

	function onStatusChange(next: JobsFilterStatus) {
		statusFilter = next;
		scopeFilter = null;
	}

	function openNewJob() {
		newOpen = true;
	}

	const contactId = $derived(page.url.searchParams.get('contact_id'));
	const filters = $derived({
		status: statusFilter,
		scope: scopeFilter,
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
	{#snippet actions()}
		{#if canCreate}
			<Button onclick={openNewJob} class="h-10 gap-1.5">
				<Plus class="h-4 w-4" /> New job
			</Button>
		{/if}
	{/snippet}
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

		{#if !contactId}
			<JobStatsCards
				{stats}
				loading={statsLoading}
				activeKey={activeStatsKey}
				onSelect={selectStatsCard}
			/>
		{/if}

		<JobFilterTabs bind:value={statusFilter} onChange={onStatusChange} />

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
						? 'Jobs are created automatically when an opportunity is Won. You can also create one manually.'
						: 'No jobs match this filter right now.'}
					actionLabel={canCreate && statusFilter === 'all' ? 'New job' : undefined}
					onAction={canCreate && statusFilter === 'all' ? openNewJob : undefined}
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

	<NewJobSheet
		bind:open={newOpen}
		{assignees}
		canEditAssignee={canCreate}
		onClose={() => (newOpen = false)}
	/>
</PageWrapper>
