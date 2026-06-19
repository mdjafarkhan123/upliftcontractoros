<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { MessageSquare, RefreshCw, WifiOff } from '@lucide/svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import InboxCommandBar from '$lib/components/inbox/InboxCommandBar.svelte';
	import InboxInlineSummary from '$lib/components/inbox/InboxInlineSummary.svelte';
	import InboxActiveFilters from '$lib/components/inbox/InboxActiveFilters.svelte';
	import InboxThreadView from '$lib/components/inbox/InboxThreadView.svelte';
	import ThreadEmptyState from '$lib/components/inbox/ThreadEmptyState.svelte';
	import ConversationRow from '$lib/components/inbox/ConversationRow.svelte';
	import { getMemberContext } from '$lib/context/member';
	import {
		inboxStore,
		type StatusFilter,
		type AssigneeFilter,
		type ThreadMessage
	} from '$lib/stores/inbox.svelte';
	import { createRealtimeManager } from '$lib/stores/realtimeReconnect';

	let { data } = $props<{
		data: {
			status: StatusFilter;
			assignee: AssigneeFilter;
			unread: boolean;
			q: string;
			tag: string;
			c: string | null;
		};
	}>();

	const member = getMemberContext();
	const canView = $derived(
		member().can_view_all_conversations || member().can_view_assigned_conversations
	);
	const canViewAll = $derived(member().can_view_all_conversations);
	const memberId = $derived(member().id);

	let status = $state<StatusFilter>(untrack(() => data.status));
	let assignee = $state<AssigneeFilter>(untrack(() => data.assignee));
	let unread = $state<boolean>(untrack(() => data.unread));
	let search = $state(untrack(() => data.q));
	let tag = $state(untrack(() => data.tag));
	let selectedId = $state<string | null>(untrack(() => data.c));

	const filters = $derived({ status, assignee, unread, q: search, tag });
	const orgTags = $derived.by(() => {
		void inboxStore.items.length;
		return inboxStore.getOrgTags();
	});

	$effect(() => {
		if (!canView) return;
		void inboxStore.loadList(filters);
	});

	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const url = new URL(window.location.href);
		if (status === 'open') url.searchParams.delete('status');
		else url.searchParams.set('status', status);
		if (assignee === 'all') url.searchParams.delete('assignee');
		else url.searchParams.set('assignee', assignee);
		if (unread) url.searchParams.set('unread', '1');
		else url.searchParams.delete('unread');
		if (search.trim()) url.searchParams.set('q', search.trim());
		else url.searchParams.delete('q');
		if (tag.trim()) url.searchParams.set('tag', tag.trim());
		else url.searchParams.delete('tag');
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			void goto(url.pathname + url.search, {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		}, 150);
	});

	let selectedTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const id = selectedId;
		if (typeof window === 'undefined') return;
		if (window.innerWidth < 1024) return;
		const url = new URL(window.location.href);
		if (id) url.searchParams.set('c', id);
		else url.searchParams.delete('c');
		if (selectedTimer) clearTimeout(selectedTimer);
		selectedTimer = setTimeout(() => {
			void goto(url.pathname + url.search, {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		}, 50);
	});

	const items = $derived(inboxStore.items);
	const nextCursor = $derived(inboxStore.nextCursor);
	const listStatus = $derived(inboxStore.listStatus);
	const errorMsg = $derived(inboxStore.listError);
	const showSkeleton = $derived(listStatus === 'loading' && items.length === 0);
	const showError = $derived(listStatus === 'error' && items.length === 0);

	let loadingMore = $state(false);
	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		await inboxStore.loadMoreList(filters);
		loadingMore = false;
	}

	type MessageSearchHit = {
		id: string;
		contact_id: string;
		contact_name: string;
		contact_phone: string;
		matched_body: string | null;
		matched_at: string;
		unread_count: number;
	};
	let messageHits = $state<MessageSearchHit[]>([]);
	let messageSearchOpen = $state(false);
	let messageSearchLoading = $state(false);
	let messageSearchTimer: ReturnType<typeof setTimeout> | null = null;

	const searchTrimmed = $derived(search.trim());

	$effect(() => {
		const q = searchTrimmed;
		if (messageSearchTimer) {
			clearTimeout(messageSearchTimer);
			messageSearchTimer = null;
		}
		if (q.length < 3) {
			messageHits = [];
			messageSearchLoading = false;
			return;
		}
		messageSearchLoading = true;
		messageSearchTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(q)}`);
				if (!res.ok) {
					messageHits = [];
					return;
				}
				const body = (await res.json()) as { data: { items: MessageSearchHit[] } };
				messageHits = body.data.items;
			} catch {
				messageHits = [];
			} finally {
				messageSearchLoading = false;
			}
		}, 300);
	});

	let isRealtimeConnected = $state(true);
	let realtimeFailed = $state(false);

	onMount(() => {
		if (!canView) return;
		const orgId = member().org_id;
		const manager = createRealtimeManager({
			build: (supabase) =>
				supabase
					.channel(`inbox:org:${orgId}`)
					.on(
						'postgres_changes',
						{
							event: 'INSERT',
							schema: 'public',
							table: 'messages',
							filter: `org_id=eq.${orgId}`
						},
						(payload: { new: ThreadMessage }) => {
							inboxStore.applyRealtimeMessageInsert(payload.new);
						}
					)
					.on(
						'postgres_changes',
						{
							event: 'UPDATE',
							schema: 'public',
							table: 'messages',
							filter: `org_id=eq.${orgId}`
						},
						(payload: { new: ThreadMessage }) => {
							inboxStore.applyRealtimeMessageUpdate(payload.new);
						}
					),
			onStatusChange: (c) => (isRealtimeConnected = c),
			onPermanentFailure: () => (realtimeFailed = true),
			onReconnect: () => inboxStore.revalidateList()
		});
		return () => manager.destroy();
	});

	const emptyTitle = $derived.by(() => {
		if (search.trim()) return 'No matches';
		if (unread) return 'All caught up';
		if (status === 'snoozed') return 'Nothing snoozed';
		if (status === 'closed') return 'No closed conversations';
		return 'No conversations yet';
	});

	const emptyDescription = $derived.by(() => {
		if (search.trim()) return 'Try a different name.';
		if (unread) return 'You have no unread messages.';
		if (status === 'snoozed') return 'Conversations you snooze will appear here.';
		if (status === 'closed') return 'Closed conversations stay available for reference.';
		return 'New conversations will appear here as customers reach out.';
	});

	function handleSelect(id: string) {
		selectedId = id;
	}

	// Counts for the inline summary chips
	const AWAITING_THRESHOLD_MS = 60 * 60 * 1000;
	const summaryCounts = $derived.by(() => {
		const now = Date.now();
		let awaiting = 0;
		let unassigned = 0;
		let failed = 0;
		for (const c of items) {
			if (c.status === 'open') {
				if (c.last_message_direction === 'inbound' && c.last_inbound_at) {
					if (now - new Date(c.last_inbound_at).getTime() > AWAITING_THRESHOLD_MS) {
						awaiting += 1;
					}
				}
				if (!c.assigned_to) unassigned += 1;
			}
			if (c.has_delivery_failure && c.status !== 'closed') failed += 1;
		}
		return {
			open: items.filter((c) => c.status === 'open').length,
			awaiting,
			unassigned,
			failed
		};
	});
</script>

<svelte:head><title>Inbox</title></svelte:head>

<PageWrapper title="Inbox" class="!max-w-none p-0">
	{#if !canView}
		<div class="px-4 py-12 md:px-6">
			<EmptyState
				icon={MessageSquare}
				title="No access"
				description="You don't have permission to view conversations."
			/>
		</div>
	{:else}
		<div class="flex h-[calc(100dvh-64px)] flex-col">
			{#if realtimeFailed}
				<div
					class="flex h-7 shrink-0 items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 text-[11px] font-medium text-amber-700 dark:text-amber-300"
				>
					<WifiOff class="h-3 w-3" />
					<span>Connection lost</span>
					<button
						type="button"
						onclick={() => location.reload()}
						class="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-800 transition-colors hover:bg-amber-500/30 dark:text-amber-200"
					>
						<RefreshCw class="h-2.5 w-2.5" />
						Refresh
					</button>
				</div>
			{:else if !isRealtimeConnected}
				<div
					class="flex h-7 shrink-0 items-center justify-center border-b border-amber-500/20 bg-amber-500/5 px-4 text-[11px] text-amber-700 dark:text-amber-300"
				>
					Live updates paused — reconnecting…
				</div>
			{/if}

			<!-- Inline summary (replaces the decorative KPI tile strip) -->
			<div class="shrink-0 px-4 pt-3 lg:px-6 lg:pt-4">
				<InboxInlineSummary
					openCount={summaryCounts.open}
					awaitingCount={summaryCounts.awaiting}
					unassignedCount={summaryCounts.unassigned}
					failedCount={summaryCounts.failed}
					onSetStatus={(s) => (status = s)}
					onSetAssignee={(a) => (assignee = a)}
				/>
			</div>

			<!-- Unified command bar (search + filters + status + message search) -->
			<div class="mt-2 shrink-0 lg:mt-3">
				<InboxCommandBar
					bind:status
					bind:assignee
					bind:unread
					bind:tag
					bind:search
					{orgTags}
					{canViewAll}
					{messageHits}
					bind:messageSearchOpen
					{messageSearchLoading}
					onSelectMessageHit={handleSelect}
				/>
			</div>

			<!-- Active filter chips (only renders when something is active) -->
			<InboxActiveFilters
				bind:assignee
				bind:tag
				bind:unread
				{canViewAll}
				onClearAssignee={() => (assignee = 'all')}
				onClearTag={() => (tag = '')}
				onClearUnread={() => (unread = false)}
			/>

			<!-- Chathead list + thread view -->
			<div
				class="mt-1 flex min-h-0 flex-1 flex-col border-t border-border/60 lg:mt-0 lg:flex-row lg:border-t-0"
			>
				<div
					class="flex min-h-0 flex-1 flex-col lg:w-[380px] lg:flex-initial lg:border-r lg:border-border/60"
				>
					<div class="min-h-0 flex-1 overflow-y-auto">
						{#if showSkeleton}
							<div class="p-3">
								<SkeletonLoader lines={6} height="64px" label="Loading conversations" />
							</div>
						{:else if showError}
							<div
								class="m-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
							>
								{errorMsg}
							</div>
						{:else if items.length === 0}
							<EmptyState icon={MessageSquare} title={emptyTitle} description={emptyDescription} />
						{:else}
							<ul class="grid gap-2 p-3 lg:hidden">
								{#each items as c (c.id)}
									<li>
										<ConversationRow conversation={c} />
									</li>
								{/each}
							</ul>
							<ul class="hidden lg:block">
								{#each items as c (c.id)}
									<li>
										<ConversationRow
											conversation={c}
											dense
											selected={selectedId === c.id}
											onSelect={handleSelect}
										/>
									</li>
								{/each}
							</ul>
							{#if nextCursor}
								<div class="flex justify-center p-3">
									<Button variant="outline" size="sm" disabled={loadingMore} onclick={loadMore}>
										{loadingMore ? 'Loading…' : 'Load more'}
									</Button>
								</div>
							{/if}
						{/if}
					</div>
				</div>

				<div class="hidden min-h-0 min-w-0 flex-1 lg:flex">
					{#if selectedId}
						<InboxThreadView conversationId={selectedId} showBackButton={false} fill />
					{:else}
						<ThreadEmptyState />
					{/if}
				</div>
			</div>
		</div>
	{/if}
</PageWrapper>
