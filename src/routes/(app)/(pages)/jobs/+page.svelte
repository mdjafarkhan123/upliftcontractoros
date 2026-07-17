<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import ListPageShell from '$lib/components/shared/ListPageShell.svelte';
	import ListBulkBar, { type BulkAction } from '$lib/components/shared/ListBulkBar.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import ListSearchBar from '$lib/components/shared/ListSearchBar.svelte';
	import JobCard from '$lib/components/jobs/JobCard.svelte';
	import JobTable from '$lib/components/jobs/JobTable.svelte';
	import JobFilterTabs from '$lib/components/jobs/JobFilterTabs.svelte';
	import JobListKpiStrip from '$lib/components/jobs/JobListKpiStrip.svelte';
	import JobFilterControl from '$lib/components/jobs/JobFilterControl.svelte';
	import RecycleBinList from '$lib/components/shared/RecycleBinList.svelte';
	import { jobsStore } from '$lib/stores/jobs.svelte';
	import type { JobsFilterStatus, JobsStatusCounts } from '$lib/types/jobs';
	import { getMemberContext } from '$lib/context/member';
	import { toast } from '$lib/stores/toast.svelte';

	type StatusKey = Exclude<JobsFilterStatus, 'all'>;

	let { data } = $props<{
		data: {
			q: string;
			status: JobsFilterStatus;
			assignedTo: string;
			dateFrom: string;
			dateTo: string;
			tags: string[];
		};
	}>();

	const member = getMemberContext();
	const canCreate = $derived(member().can_view_full_pipeline);
	const canDelete = $derived(member().can_view_full_pipeline);
	const canViewAll = $derived(member().can_view_full_pipeline);

	// ── Filter state (seeded from the URL once, then this page owns the URL) ──────
	let searchInput = $state(untrack(() => data.q));
	let q = $state(untrack(() => data.q));
	let statusFilter = $state<JobsFilterStatus>(untrack(() => data.status));
	let assignedTo = $state(untrack(() => data.assignedTo));
	let dateFrom = $state(untrack(() => data.dateFrom));
	let dateTo = $state(untrack(() => data.dateTo));
	let tags = $state<string[]>(untrack(() => data.tags));

	// Deep-link from a contact detail page ("jobs for this contact"). Stays reactive to
	// the URL so the clear button (goto('/jobs')) drops it.
	const contactId = $derived(page.url.searchParams.get('contact_id'));
	// Recycle-bin view (Deleted tab) — swaps the table for the shared bin list.
	const isDeletedView = $derived(statusFilter === 'deleted');

	const filters = $derived({
		status: statusFilter,
		scope: null,
		assignedTo: assignedTo || null,
		contactId: contactId ?? null,
		search: q,
		dateFrom: dateFrom || null,
		dateTo: dateTo || null,
		tags: tags.length ? tags : undefined
	});

	$effect(() => {
		void jobsStore.load(filters);
	});

	// Keep the URL in lockstep with the filters (never touches contact_id).
	$effect(() => {
		const f = filters;
		const url = new URL(page.url);
		const set = (k: string, v: string, keep: (v: string) => boolean) => {
			if (keep(v)) url.searchParams.set(k, v);
			else url.searchParams.delete(k);
		};
		set('q', f.search, (v) => v.trim().length > 0);
		set('status', f.status, (v) => v !== 'all');
		set('assigned_to', f.assignedTo ?? '', (v) => v.length > 0);
		set('date_from', f.dateFrom ?? '', (v) => v.length > 0);
		set('date_to', f.dateTo ?? '', (v) => v.length > 0);
		url.searchParams.delete('tags');
		for (const t of tags) url.searchParams.append('tags', t);
		if (url.search !== page.url.search) {
			replaceState(`${url.pathname}${url.search}`, {});
		}
	});

	// ── Stat counts (KPI strip + tab badges) ─────────────────────────────────────
	let counts = $state<JobsStatusCounts>({
		pending: 0,
		upcoming: 0,
		today: 0,
		overdue: 0,
		action_required: 0,
		in_progress: 0,
		on_hold: 0,
		completed: 0,
		cancelled: 0
	});
	let countsLoaded = $state(false);

	async function loadStats() {
		try {
			const res = await fetch('/api/jobs/stats');
			if (res.ok) {
				const body = (await res.json()) as { data: { status_counts: JobsStatusCounts } };
				counts = body.data.status_counts;
			}
		} finally {
			countsLoaded = true;
		}
	}
	$effect(() => {
		void loadStats();
	});

	// ── Technician list (full-pipeline managers only) ────────────────────────────
	let assignees = $state<{ id: string; full_name: string }[]>([]);
	let assigneesLoaded = $state(false);
	$effect(() => {
		if (!canViewAll || assigneesLoaded) return;
		assigneesLoaded = true;
		void fetch('/api/contacts/assignees').then(async (r) => {
			if (!r.ok) return;
			const a = (await r.json()) as { assignees: { id: string; full_name: string }[] };
			assignees = a.assignees;
		});
	});
	const showTechnician = $derived(canViewAll && assignees.length > 0);

	const items = $derived(jobsStore.items);
	const nextCursor = $derived(jobsStore.nextCursor);
	const status = $derived(jobsStore.status);
	const errorMsg = $derived(jobsStore.error);
	const filterContext = $derived(jobsStore.filterContext);
	const hasActiveFilters = $derived(
		q.trim().length > 0 || !!assignedTo || !!dateFrom || !!dateTo || tags.length > 0
	);

	let loadingMore = $state(false);
	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		await jobsStore.loadMore(filters);
		loadingMore = false;
	}

	function onSelectKpi(s: StatusKey) {
		// Click an active card again to clear back to All.
		statusFilter = statusFilter === s ? 'all' : s;
	}

	function openNewJob() {
		goto('/jobs/new');
	}

	function clearContactFilter() {
		goto('/jobs', { keepFocus: true, noScroll: true });
	}

	// ── Duplicate ────────────────────────────────────────────────────────────────
	let duplicatingId = $state<string | null>(null);
	async function handleDuplicate(id: string) {
		if (duplicatingId) return;
		duplicatingId = id;
		try {
			const res = await fetch(`/api/jobs/${id}/duplicate`, { method: 'POST' });
			if (res.ok) {
				const body = (await res.json()) as { job: { id: string } };
				toast.success('Job duplicated — set its schedule');
				void loadStats();
				goto(`/jobs/${body.job.id}`);
			} else {
				const b = await res.json().catch(() => ({}));
				toast.error(b.error ?? 'Failed to duplicate job');
			}
		} finally {
			duplicatingId = null;
		}
	}

	// ── Delete (soft-delete → hidden everywhere) ─────────────────────────────────
	let deleteTarget = $state<{ id: string; title: string } | null>(null);
	let deleteDialogOpen = $state(false);
	let deleteBusy = $state(false);

	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!deleteDialogOpen || ConfirmDialog) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});

	function handleDeleteRequest(id: string, title: string) {
		deleteTarget = { id, title };
		deleteDialogOpen = true;
	}

	// ── Restore (recycle bin) ────────────────────────────────────────────────────
	function handleRestored(id: string) {
		jobsStore.remove(id);
		void loadStats();
	}

	async function handleDeleteConfirm() {
		if (!deleteTarget || deleteBusy) return;
		deleteBusy = true;
		try {
			const res = await fetch(`/api/jobs/${deleteTarget.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const b = await res.json().catch(() => ({}));
				toast.error(b.error ?? 'Delete failed');
				return;
			}
			const title = deleteTarget.title;
			jobsStore.remove(deleteTarget.id);
			void loadStats();
			toast.success(`${title} deleted`);
			deleteDialogOpen = false;
		} finally {
			deleteBusy = false;
		}
	}

	// ── Bulk selection ───────────────────────────────────────────────────────────
	let selectionMode = $state(false);
	const selected = new SvelteSet<string>();
	const selectedIds = $derived([...selected]);

	function enterSelect() {
		selectionMode = true;
	}
	function exitSelect() {
		selectionMode = false;
		selected.clear();
	}
	function toggleSelect(id: string) {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
	}
	const allLoadedSelected = $derived(items.length > 0 && selected.size === items.length);
	function toggleSelectAll() {
		if (allLoadedSelected) selected.clear();
		else for (const j of items) selected.add(j.id);
	}

	// Selection doesn't apply to the recycle bin — leave select mode on switch.
	$effect(() => {
		if (isDeletedView && selectionMode) exitSelect();
	});

	let bulkDeleteOpen = $state(false);
	let bulkBusy = $state(false);
	let BulkConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!bulkDeleteOpen || BulkConfirmDialog) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			BulkConfirmDialog = m.default;
		});
	});

	const bulkActions = $derived<BulkAction[]>([
		{
			key: 'delete',
			label: 'Delete',
			icon: 'ri-delete-bin-line',
			tone: 'danger',
			onSelect: () => (bulkDeleteOpen = true)
		}
	]);

	async function handleBulkDelete() {
		if (bulkBusy || selectedIds.length === 0) return;
		bulkBusy = true;
		try {
			const ids = selectedIds;
			const res = await fetch('/api/jobs/bulk', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'delete', ids })
			});
			const b = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(b.error ?? 'Failed to delete jobs');
				return;
			}
			const n = b.data?.deleted ?? ids.length;
			for (const id of ids) jobsStore.remove(id);
			void loadStats();
			toast.success(`${n} job${n === 1 ? '' : 's'} deleted`);
			bulkDeleteOpen = false;
			exitSelect();
		} finally {
			bulkBusy = false;
		}
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
		{#if selectionMode}
			<Button type="button" variant="secondary" onclick={exitSelect}>Done</Button>
		{:else}
			{#if canDelete && !isDeletedView}
				<Button type="button" variant="secondary" onclick={enterSelect}>
					<i class="ri-checkbox-line" aria-hidden="true"></i> Select
				</Button>
			{/if}
			{#if canCreate}
				<Button type="button" onclick={openNewJob}>
					<i class="ri-add-line" aria-hidden="true"></i> New job
				</Button>
			{/if}
		{/if}
	{/snippet}

	<ListPageShell
		{status}
		itemCount={items.length}
		{errorMsg}
		{nextCursor}
		{loadingMore}
		onLoadMore={loadMore}
		skeletonLines={6}
		skeletonHeight="64px"
		skeletonLabel="Loading jobs"
	>
		{#snippet kpi()}
			{#if !contactId && !isDeletedView}
				<JobListKpiStrip
					{counts}
					loading={!countsLoaded}
					activeStatus={statusFilter}
					onSelect={onSelectKpi}
				/>
			{/if}
		{/snippet}

		{#snippet tabs()}
			<JobFilterTabs bind:value={statusFilter} {counts} />
		{/snippet}

		{#snippet search()}
			<ListSearchBar
				bind:value={searchInput}
				placeholder="Search jobs by title or client"
				onInput={(v) => (q = v)}
			/>
		{/snippet}

		{#snippet filter()}
			<JobFilterControl
				bind:assignedTo
				bind:dateFrom
				bind:dateTo
				bind:tags
				{assignees}
				{showTechnician}
			/>
		{/snippet}

		{#snippet banner()}
			{#if contactId && filterContext}
				<div class="jobs-filter-banner">
					<span class="jobs-filter-banner__label">Active filter:</span>
					<span class="jobs-filter-banner__chip">Contact: {filterContext.contact_name}</span>
					<button type="button" class="jobs-filter-banner__clear" onclick={clearContactFilter}>
						<i class="ri-close-line" aria-hidden="true"></i>
						Clear filter
					</button>
				</div>
			{/if}
		{/snippet}

		{#snippet empty()}
			{#if isDeletedView}
				<EmptyState
					iconClass="ri-delete-bin-line"
					title="Recycle bin is empty"
					description="Deleted jobs appear here for 30 days, then are permanently removed. Restore one any time before then."
				/>
			{:else if contactId}
				<EmptyState
					iconClass="ri-briefcase-line"
					title="No jobs found for this contact."
					description="Try clearing the filter to see all jobs."
					actionLabel="Clear filter"
					onAction={clearContactFilter}
				/>
			{:else if hasActiveFilters}
				<EmptyState
					iconClass="ri-briefcase-line"
					title="No jobs match your filters"
					description="Try a different search, status, technician, date range, or tag."
				/>
			{:else}
				<EmptyState
					iconClass="ri-briefcase-line"
					title="No jobs yet"
					description={statusFilter === 'all'
						? 'Jobs are created automatically when an opportunity is Won. You can also create one manually.'
						: 'No jobs match this status right now.'}
					actionLabel={canCreate && statusFilter === 'all' ? 'New job' : undefined}
					onAction={canCreate && statusFilter === 'all' ? openNewJob : undefined}
				/>
			{/if}
		{/snippet}

		{#snippet content()}
			{#if isDeletedView}
				<RecycleBinList
					items={items.map((j) => ({
						id: j.id,
						title: j.title,
						subtitle: j.contact_name,
						deleted_at: j.deleted_at
					}))}
					noun="job"
					restoreEndpoint={(id) => `/api/jobs/${id}/restore`}
					canRestore={canDelete}
					onRestored={handleRestored}
				/>
			{:else}
				<!-- Desktop: table -->
				<div class="jobs-page__table">
					<JobTable
						{items}
						{canDelete}
						selectable={selectionMode}
						{selected}
						onToggleSelect={toggleSelect}
						onToggleAll={toggleSelectAll}
						allSelected={allLoadedSelected}
						onDuplicate={handleDuplicate}
						onDeleteRequest={handleDeleteRequest}
					/>
				</div>

				<!-- Mobile: cards -->
				<ul class="jobs-page__cards">
					{#each items as job (job.id)}
						<li>
							<JobCard
								{job}
								{canDelete}
								onDuplicate={handleDuplicate}
								onDeleteRequest={handleDeleteRequest}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		{/snippet}
	</ListPageShell>
</PageWrapper>

{#if deleteTarget && ConfirmDialog}
	<ConfirmDialog
		bind:open={deleteDialogOpen}
		title="Delete {deleteTarget.title}?"
		description="This job and its scheduled visits will be removed from your lists and calendar."
		confirmLabel="Delete job"
		variant="destructive"
		loading={deleteBusy}
		onConfirm={handleDeleteConfirm}
	/>
{/if}

{#if selectionMode && selectedIds.length > 0}
	<ListBulkBar
		count={selectedIds.length}
		actions={bulkActions}
		busy={bulkBusy}
		onCancel={exitSelect}
	/>
{/if}

{#if bulkDeleteOpen && BulkConfirmDialog}
	<BulkConfirmDialog
		bind:open={bulkDeleteOpen}
		title="Delete {selectedIds.length} job{selectedIds.length === 1 ? '' : 's'}?"
		description="They move to the Recycle Bin — you can restore them within 30 days. Their scheduled visits leave the calendar too."
		confirmLabel="Move to Recycle Bin"
		variant="destructive"
		loading={bulkBusy}
		onConfirm={handleBulkDelete}
	/>
{/if}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	// Toolbar / search / load-more / skeleton now live in <ListPageShell>. Only the
	// jobs-specific desktop-table vs mobile-card switch remains here.
	.jobs-page {
		&__table {
			display: none;
			@media (min-width: $bp-tablet) {
				display: block;
			}
		}
		&__cards {
			display: grid;
			gap: $space-3;
			list-style: none;
			margin: 0;
			padding: 0;
			@media (min-width: $bp-tablet) {
				display: none;
			}
		}
	}
</style>
