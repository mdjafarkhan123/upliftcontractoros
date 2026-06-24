<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Star, MessageSquareWarning, Send, Search } from '@lucide/svelte';
	import ReputationStats from '$lib/components/reputation/ReputationStats.svelte';
	import FunnelDashboard from '$lib/components/reputation/FunnelDashboard.svelte';
	import ReviewCard from '$lib/components/reputation/ReviewCard.svelte';
	import PrivateFeedbackCard from '$lib/components/reputation/PrivateFeedbackCard.svelte';
	import ReviewRequestRow from '$lib/components/reputation/ReviewRequestRow.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { cn } from '$lib/utils/cn';
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

			<FunnelDashboard />

			<Tabs.Root value={tab} onValueChange={(v) => (tab = v as Tab)}>
				<Tabs.List class="w-full">
					<Tabs.Trigger value="reviews" class="flex-1">Reviews</Tabs.Trigger>
					{#if canViewNegative}
						<Tabs.Trigger value="negative" class="flex-1">Negative</Tabs.Trigger>
					{/if}
					<Tabs.Trigger value="requests" class="flex-1">Requests</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="reviews" class="mt-4 space-y-3">
					{#if reviews.length > 0 || searchingReviews}
						<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
							<div class="relative flex-1">
								<Search
									class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
								/>
								<Input
									bind:value={reviewsSearch}
									placeholder="Search by customer, job, or review text"
									class="pl-9"
								/>
							</div>
							{#if !searchingReviews}
								<Select.Root bind:value={reviewsSort}>
									<Select.Trigger class="h-11 sm:w-52" aria-label="Sort reviews">
										<Select.Value />
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="newest">Newest first</Select.Item>
										<Select.Item value="oldest">Oldest first</Select.Item>
										<Select.Item value="score_high">Highest rating</Select.Item>
										<Select.Item value="score_low">Lowest rating</Select.Item>
									</Select.Content>
								</Select.Root>
							{/if}
						</div>
					{/if}
					{#if reviewsStatus === 'loading' && reviews.length === 0}
						<SkeletonLoader lines={5} height="92px" label="Loading reviews" />
					{:else if reviews.length === 0 && searchingReviews}
						<EmptyState
							icon={Search}
							title="No matches"
							description="No reviews match your search. Try a different name, job, or keyword."
						/>
					{:else if reviews.length === 0}
						<EmptyState
							icon={Star}
							title="No reviews yet"
							description="Positive customer responses will appear here."
						/>
					{:else}
						<ul class="grid gap-3">
							{#each filteredReviews as r (r.id)}
								<li><ReviewCard review={r} /></li>
							{/each}
						</ul>
					{/if}
				</Tabs.Content>

				{#if canViewNegative}
					<Tabs.Content value="negative" class="mt-4 space-y-3">
						{#if negative.length > 0}
							<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
								<div class="relative flex-1">
									<Search
										class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
									/>
									<Input
										bind:value={negativeSearch}
										placeholder="Search by customer or job"
										class="pl-9"
									/>
								</div>
								<Select.Root bind:value={negativeSort}>
									<Select.Trigger class="h-11 sm:w-52" aria-label="Sort feedback">
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
						{/if}
						{#if negativeStatus === 'loading' && negative.length === 0}
							<SkeletonLoader lines={5} height="92px" label="Loading feedback" />
						{:else if negative.length === 0}
							<EmptyState
								icon={MessageSquareWarning}
								title="No negative feedback"
								description="Private feedback from customers will appear here."
							/>
						{:else if filteredNegative.length === 0}
							<EmptyState icon={Search} title="No matches" description="Try a different search." />
						{:else}
							<ul class="grid gap-3">
								{#each filteredNegative as f (f.id)}
									<li><PrivateFeedbackCard feedback={f} /></li>
								{/each}
							</ul>
						{/if}
					</Tabs.Content>
				{/if}

				<Tabs.Content value="requests" class="mt-4 space-y-3">
					{#if canSendRequests}
						<div class="flex justify-end">
							<Button size="sm" class="h-9" onclick={() => (sendSheetOpen = true)}>
								<Send class="h-4 w-4" /> Send request
							</Button>
						</div>
					{/if}

					{#if requests.length > 0}
						<div
							class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
							role="tablist"
							aria-label="Filter by status"
						>
							{#each STATUS_CHIPS as chip (chip.value)}
								{@const active = requestsStatusFilter === chip.value}
								{@const count = requestsCounts[chip.value]}
								<button
									type="button"
									role="tab"
									aria-selected={active}
									onclick={() => (requestsStatusFilter = chip.value)}
									class={cn(
										'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
										active
											? 'border-primary bg-primary text-primary-foreground shadow-sm'
											: 'border-border bg-card text-muted-foreground hover:border-foreground/20 hover:bg-muted hover:text-foreground dark:bg-card-raised/60'
									)}
								>
									<span>{chip.label}</span>
									<span
										class={cn(
											'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
											active
												? 'bg-primary-foreground/20 text-primary-foreground'
												: 'bg-muted text-muted-foreground dark:bg-white/5'
										)}
									>
										{count}
									</span>
								</button>
							{/each}
						</div>

						<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
							<div class="relative flex-1">
								<Search
									class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
								/>
								<Input
									bind:value={requestsSearch}
									placeholder="Search by customer or job"
									class="pl-9"
								/>
							</div>
							<Select.Root bind:value={requestsSort}>
								<Select.Trigger class="h-11 sm:w-52" aria-label="Sort requests">
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

					{#if requestsStatus === 'loading' && requests.length === 0}
						<SkeletonLoader lines={5} height="92px" label="Loading requests" />
					{:else if requests.length === 0}
						<EmptyState
							icon={Send}
							title="No review requests yet"
							description="Requests sent to customers — automatic and manual — will appear here."
						/>
					{:else if filteredRequests.length === 0}
						<EmptyState
							icon={Search}
							title="No matches"
							description="Try a different status, filter, or search."
						/>
					{:else}
						<ul class="grid gap-3">
							{#each filteredRequests as r (r.id)}
								<li><ReviewRequestRow request={r} /></li>
							{/each}
						</ul>
					{/if}
				</Tabs.Content>
			</Tabs.Root>
		</div>

		{#if canSendRequests && SendRequestSheet}
			<SendRequestSheet bind:open={sendSheetOpen} />
		{/if}
	{/if}
</PageWrapper>
