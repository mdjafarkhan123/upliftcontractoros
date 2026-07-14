<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import ListPageShell from '$lib/components/shared/ListPageShell.svelte';
	import ListTabs, { type ListTab } from '$lib/components/shared/ListTabs.svelte';
	import ListSearchBar from '$lib/components/shared/ListSearchBar.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import ReputationStats from '$lib/components/reputation/ReputationStats.svelte';
	import FunnelDashboard from '$lib/components/reputation/FunnelDashboard.svelte';
	import ReviewCard from '$lib/components/reputation/ReviewCard.svelte';
	import PrivateFeedbackCard from '$lib/components/reputation/PrivateFeedbackCard.svelte';
	import ReviewRequestRow from '$lib/components/reputation/ReviewRequestRow.svelte';
	import * as Select from '$lib/components/ui/select';
	import {
		reviewsStore,
		privateFeedbackStore,
		reviewRequestsStore,
		reputationSummaryStore
	} from '$lib/stores/reputation.svelte';
	import { getMemberContext } from '$lib/context/member';
	import type { ReviewRequestListItem } from '$lib/types/reputation';

	const member = getMemberContext();
	const canViewReviews = $derived(member().can_view_reviews);
	const canViewNegative = $derived(member().can_view_negative_feedback);
	const canSendRequests = $derived(member().can_send_review_requests);

	type Tab = 'reviews' | 'negative' | 'requests';
	let tab = $state<Tab>('reviews');
	let sendSheetOpen = $state(false);

	// The send-request sheet (form + contact picker) is only needed once the user
	// clicks "Send request". Lazy-load it so the page paints just the list UI.
	let SendRequestSheet = $state<
		typeof import('$lib/components/reputation/SendRequestSheet.svelte').default | null
	>(null);
	let sendSheetLoading = $state(false);
	$effect(() => {
		if (!sendSheetOpen || SendRequestSheet || sendSheetLoading) return;
		sendSheetLoading = true;
		void import('$lib/components/reputation/SendRequestSheet.svelte').then((m) => {
			SendRequestSheet = m.default;
		});
	});

	$effect(() => {
		if (!canViewReviews) return;
		void reputationSummaryStore.load();
	});

	// Reviews search is server-side (trigram, incl. the review body). Debounce
	// typing; an empty box loads immediately (the unfiltered list).
	$effect(() => {
		if (!canViewReviews) return;
		const term = reviewsSearch.trim();
		if (!term) {
			void reviewsStore.load('');
			return;
		}
		const t = setTimeout(() => void reviewsStore.load(term), 250);
		return () => clearTimeout(t);
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

	// --- Filter / sort state (client-side, per-tab) ---
	type RequestStatusFilter =
		| 'all'
		| 'scheduled'
		| 'sent'
		| 'engaged'
		| 'likely_reviewed'
		| 'completed_internal'
		| 'expired';

	let reviewsSearch = $state('');
	let reviewsSort = $state<'newest' | 'oldest' | 'score_high' | 'score_low'>('newest');
	const searchingReviews = $derived(reviewsSearch.trim().length > 0);

	let negativeSearch = $state('');
	let negativeSort = $state<'newest' | 'oldest' | 'score_high' | 'score_low'>('newest');

	let requestsSearch = $state('');
	let requestsStatusFilter = $state<RequestStatusFilter>('all');
	let requestsSort = $state<'newest' | 'oldest' | 'status' | 'name'>('newest');

	function norm(s: string): string {
		return s.toLowerCase();
	}

	// Treat sent/engaged + is_expired as "expired" — matches row display logic.
	function displayStatus(r: ReviewRequestListItem): RequestStatusFilter {
		if ((r.status === 'sent' || r.status === 'engaged') && r.is_expired) return 'expired';
		return r.status;
	}

	function primaryDate(r: ReviewRequestListItem): string {
		return (
			r.attributed_at ?? r.completed_at ?? r.expired_at ?? r.engaged_at ?? r.sent_at ?? r.created_at
		);
	}

	const STATUS_ORDER: Record<RequestStatusFilter, number> = {
		all: 0,
		scheduled: 1,
		sent: 2,
		engaged: 3,
		likely_reviewed: 4,
		completed_internal: 5,
		expired: 6
	};

	const STATUS_CHIPS: { value: RequestStatusFilter; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'scheduled', label: 'Scheduled' },
		{ value: 'sent', label: 'Sent' },
		{ value: 'engaged', label: 'Engaged' },
		{ value: 'likely_reviewed', label: 'Likely reviewed' },
		{ value: 'completed_internal', label: 'Internal feedback' },
		{ value: 'expired', label: 'Expired' }
	];

	const requestsCounts = $derived.by(() => {
		const counts: Record<RequestStatusFilter, number> = {
			all: requests.length,
			scheduled: 0,
			sent: 0,
			engaged: 0,
			likely_reviewed: 0,
			completed_internal: 0,
			expired: 0
		};
		for (const r of requests) counts[displayStatus(r)]++;
		return counts;
	});

	// Server already filtered + ranked by relevance while searching, so render as-is.
	// When browsing (no term), apply the client-side sort dropdown.
	const filteredReviews = $derived.by(() => {
		if (searchingReviews) return reviews;
		const list = reviews.slice();
		list.sort((a, b) => {
			if (reviewsSort === 'newest') return b.created_at.localeCompare(a.created_at);
			if (reviewsSort === 'oldest') return a.created_at.localeCompare(b.created_at);
			if (reviewsSort === 'score_high') return b.score - a.score;
			return a.score - b.score;
		});
		return list;
	});

	const filteredNegative = $derived.by(() => {
		const q = norm(negativeSearch.trim());
		const list = q
			? negative.filter(
					(r) => norm(r.contact_name).includes(q) || norm(r.job_title ?? '').includes(q)
				)
			: negative.slice();
		list.sort((a, b) => {
			if (negativeSort === 'newest') return b.created_at.localeCompare(a.created_at);
			if (negativeSort === 'oldest') return a.created_at.localeCompare(b.created_at);
			if (negativeSort === 'score_high') return b.score - a.score;
			return a.score - b.score;
		});
		return list;
	});

	const filteredRequests = $derived.by(() => {
		const q = norm(requestsSearch.trim());
		const list = requests.filter((r) => {
			if (requestsStatusFilter !== 'all' && displayStatus(r) !== requestsStatusFilter) return false;
			if (!q) return true;
			return norm(r.contact_name).includes(q) || norm(r.job_title ?? '').includes(q);
		});
		list.sort((a, b) => {
			if (requestsSort === 'newest') return primaryDate(b).localeCompare(primaryDate(a));
			if (requestsSort === 'oldest') return primaryDate(a).localeCompare(primaryDate(b));
			if (requestsSort === 'status') {
				return STATUS_ORDER[displayStatus(a)] - STATUS_ORDER[displayStatus(b)];
			}
			return a.contact_name.localeCompare(b.contact_name);
		});
		return list;
	});

	// --- Chassis wiring: one ListPageShell driven by the active tab's dataset ---
	const mainTabs = $derived<ListTab<Tab>[]>([
		{ value: 'reviews', label: 'Reviews' },
		...(canViewNegative ? [{ value: 'negative' as const, label: 'Negative' }] : []),
		{ value: 'requests', label: 'Requests' }
	]);

	const activeStatus = $derived(
		tab === 'reviews' ? reviewsStatus : tab === 'negative' ? negativeStatus : requestsStatus
	);
	const activeCount = $derived(
		tab === 'reviews'
			? filteredReviews.length
			: tab === 'negative'
				? filteredNegative.length
				: filteredRequests.length
	);
	// Requests carries a secondary status filter; a non-'all' chip narrowing to zero
	// is a "no matches" state, not "nothing here yet".
	const requestsFiltering = $derived(
		requestsSearch.trim().length > 0 || requestsStatusFilter !== 'all'
	);
</script>

<svelte:head><title>Reputation</title></svelte:head>

<PageWrapper title="Reputation" subtitle="Reviews, feedback, and review requests">
	{#snippet actions()}
		{#if canViewReviews && canSendRequests}
			<Button type="button" onclick={() => (sendSheetOpen = true)}>
				<i class="ri-send-plane-line" aria-hidden="true"></i>
				Send request
			</Button>
		{/if}
	{/snippet}

	{#if !canViewReviews}
		<EmptyState
			iconClass="ri-star-line"
			title="No access"
			description="You don't have permission to view reputation data."
		/>
	{:else}
		<ListPageShell
			status={activeStatus}
			itemCount={activeCount}
			skeletonLines={5}
			skeletonHeight="92px"
			skeletonLabel="Loading"
		>
			{#snippet kpi()}
				{#if summary}
					<ReputationStats {summary} />
				{:else if reputationSummaryStore.status === 'loading'}
					<SkeletonLoader lines={1} height="132px" label="Loading stats" />
				{/if}
				<FunnelDashboard />
			{/snippet}

			{#snippet tabs()}
				<ListTabs tabs={mainTabs} bind:value={tab} ariaLabel="Reputation views" />
			{/snippet}

			{#snippet search()}
				{#if tab === 'reviews'}
					<ListSearchBar
						bind:value={reviewsSearch}
						placeholder="Search by customer, job, or review text"
					/>
				{:else if tab === 'negative'}
					<ListSearchBar bind:value={negativeSearch} placeholder="Search by customer or job" />
				{:else}
					<ListSearchBar bind:value={requestsSearch} placeholder="Search by customer or job" />
				{/if}
			{/snippet}

			{#snippet filter()}
				{#if tab === 'reviews' && !searchingReviews}
					<div class="rep-sort">
						<Select.Root bind:value={reviewsSort}>
							<Select.Trigger class="field__input" aria-label="Sort reviews">
								<Select.Value />
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="newest">Newest first</Select.Item>
								<Select.Item value="oldest">Oldest first</Select.Item>
								<Select.Item value="score_high">Highest rating</Select.Item>
								<Select.Item value="score_low">Lowest rating</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>
				{:else if tab === 'negative'}
					<div class="rep-sort">
						<Select.Root bind:value={negativeSort}>
							<Select.Trigger class="field__input" aria-label="Sort feedback">
								<Select.Value />
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="newest">Newest first</Select.Item>
								<Select.Item value="oldest">Oldest first</Select.Item>
								<Select.Item value="score_high">Highest rating</Select.Item>
								<Select.Item value="score_low">Lowest rating</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>
				{:else if tab === 'requests'}
					<div class="rep-sort">
						<Select.Root bind:value={requestsSort}>
							<Select.Trigger class="field__input" aria-label="Sort requests">
								<Select.Value />
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="newest">Newest first</Select.Item>
								<Select.Item value="oldest">Oldest first</Select.Item>
								<Select.Item value="status">By status</Select.Item>
								<Select.Item value="name">Customer name</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>
				{/if}
			{/snippet}

			{#snippet banner()}
				{#if tab === 'requests' && requests.length > 0}
					<div class="rep-chips" role="tablist" aria-label="Filter by status">
						{#each STATUS_CHIPS as chip (chip.value)}
							{@const active = requestsStatusFilter === chip.value}
							{@const count = requestsCounts[chip.value]}
							<button
								type="button"
								role="tab"
								aria-selected={active}
								onclick={() => (requestsStatusFilter = chip.value)}
								class="rep-chips__chip"
								class:rep-chips__chip--active={active}
							>
								<span>{chip.label}</span>
								<span class="rep-chips__count">{count}</span>
							</button>
						{/each}
					</div>
				{/if}
			{/snippet}

			{#snippet empty()}
				{#if tab === 'reviews'}
					{#if searchingReviews}
						<EmptyState
							iconClass="ri-search-line"
							title="No matches"
							description="No reviews match your search. Try a different name, job, or keyword."
						/>
					{:else}
						<EmptyState
							iconClass="ri-star-line"
							title="No reviews yet"
							description="Positive customer responses will appear here."
						/>
					{/if}
				{:else if tab === 'negative'}
					{#if negativeSearch.trim()}
						<EmptyState
							iconClass="ri-search-line"
							title="No matches"
							description="Try a different search."
						/>
					{:else}
						<EmptyState
							iconClass="ri-feedback-line"
							title="No negative feedback"
							description="Private feedback from customers will appear here."
						/>
					{/if}
				{:else if requestsFiltering}
					<EmptyState
						iconClass="ri-search-line"
						title="No matches"
						description="Try a different status, filter, or search."
					/>
				{:else}
					<EmptyState
						iconClass="ri-send-plane-line"
						title="No review requests yet"
						description="Requests sent to customers — automatic and manual — will appear here."
					/>
				{/if}
			{/snippet}

			{#snippet content()}
				{#if tab === 'reviews'}
					<ul class="rep-list">
						{#each filteredReviews as r (r.id)}
							<li><ReviewCard review={r} /></li>
						{/each}
					</ul>
				{:else if tab === 'negative'}
					<ul class="rep-list">
						{#each filteredNegative as f (f.id)}
							<li><PrivateFeedbackCard feedback={f} /></li>
						{/each}
					</ul>
				{:else}
					<ul class="rep-list">
						{#each filteredRequests as r (r.id)}
							<li><ReviewRequestRow request={r} /></li>
						{/each}
					</ul>
				{/if}
			{/snippet}
		</ListPageShell>
	{/if}
</PageWrapper>

{#if canViewReviews && canSendRequests && SendRequestSheet}
	<SendRequestSheet bind:open={sendSheetOpen} />
{/if}
