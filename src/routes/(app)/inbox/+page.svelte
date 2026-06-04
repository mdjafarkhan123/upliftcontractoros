<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { MessageSquare, Search } from '@lucide/svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import InboxFilters from '$lib/components/inbox/InboxFilters.svelte';
	import InboxQuickFilters from '$lib/components/inbox/InboxQuickFilters.svelte';
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
		};
	}>();

	const member = getMemberContext();
	const canView = $derived(
		member().can_view_all_conversations || member().can_view_assigned_conversations
	);
	const canViewAll = $derived(member().can_view_all_conversations);

	let status = $state<StatusFilter>(untrack(() => data.status));
	let assignee = $state<AssigneeFilter>(untrack(() => data.assignee));
	let unread = $state<boolean>(untrack(() => data.unread));
	let search = $state(untrack(() => data.q));
	let tag = $state(untrack(() => data.tag));

	const filters = $derived({ status, assignee, unread, q: search, tag });
	const orgTags = $derived.by(() => {
		// Touch items so $derived recomputes when the list cache updates.
		void inboxStore.items.length;
		return inboxStore.getOrgTags();
	});

	$effect(() => {
		if (!canView) return;
		void inboxStore.loadList(filters);
	});

	// Sync URL — keep filter state shareable / bookmarkable without forcing reload.
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
			void goto(url.pathname + url.search, { replaceState: true, keepFocus: true, noScroll: true });
		}, 150);
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

	let isRealtimeConnected = $state(true);
	let realtimeFailed = $state(false);

	// ── Message body search (debounced) ────────────────────────────────────
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
	let messageSearchLoading = $state(false);
	let messageSearchOpen = $state(false);
	let messageSearchTimer: ReturnType<typeof setTimeout> | null = null;

	const searchTrimmed = $derived(search.trim());

	$effect(() => {
		const q = searchTrimmed;
		if (messageSearchTimer) {
			clearTimeout(messageSearchTimer);
			messageSearchTimer = null;
		}
		if (!messageSearchOpen || q.length < 3) {
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
</script>

<svelte:head><title>Inbox</title></svelte:head>

<PageWrapper title="Inbox" subtitle="Stay connected with every customer" class="max-w-screen-2xl">
	{#if !canView}
		<EmptyState
			icon={MessageSquare}
			title="No access"
			description="You don't have permission to view conversations."
		/>
	{:else}
		<div class="mx-auto flex max-w-4xl flex-col gap-4">
			{#if realtimeFailed}
				<div
					class="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-center text-xs font-medium text-amber-700 dark:text-amber-300"
				>
					Connection lost — refresh the page to reconnect.
				</div>
			{:else if !isRealtimeConnected}
				<div
					class="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-center text-xs text-amber-700 dark:text-amber-300"
				>
					Live updates paused — reconnecting…
				</div>
			{/if}
			<div class="rounded-xl border border-border/60 bg-card p-3 shadow-card">
				<div class="relative">
					<Search
						class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70"
					/>
					<Input
						type="search"
						inputmode="search"
						placeholder="Search by contact name"
						class="h-11 rounded-lg border-border/60 bg-background pl-10 shadow-none transition-all duration-150 focus-visible:border-primary/50 focus-visible:ring-primary/20"
						bind:value={search}
					/>
				</div>

				{#if searchTrimmed.length >= 3}
					<div class="mt-2 flex items-center justify-between">
						<button
							type="button"
							class="text-xs font-medium text-primary hover:underline"
							onclick={() => (messageSearchOpen = !messageSearchOpen)}
						>
							{messageSearchOpen ? 'Hide' : 'Search messages'} for "{searchTrimmed}"
						</button>
						{#if messageSearchOpen && messageSearchLoading}
							<span class="text-xs text-muted-foreground">Searching…</span>
						{/if}
					</div>
					{#if messageSearchOpen && !messageSearchLoading && messageHits.length > 0}
						<ul class="mt-2 grid gap-1.5">
							{#each messageHits as h (h.id)}
								<li>
									<a
										href={`/inbox/${h.id}`}
										class="block rounded-lg border border-border/60 bg-background p-3 transition-colors hover:bg-muted"
									>
										<div class="flex items-center justify-between gap-2">
											<span class="truncate text-sm font-semibold">{h.contact_name}</span>
											{#if h.unread_count > 0}
												<span
													class="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
													>{h.unread_count}</span
												>
											{/if}
										</div>
										{#if h.matched_body}
											<div class="mt-1 line-clamp-2 text-xs text-muted-foreground">
												{h.matched_body}
											</div>
										{/if}
									</a>
								</li>
							{/each}
						</ul>
					{:else if messageSearchOpen && !messageSearchLoading}
						<div class="mt-2 text-xs text-muted-foreground">No matching messages.</div>
					{/if}
				{/if}

				<div class="mt-3 flex flex-col gap-2">
					<InboxFilters bind:value={status} />
					<InboxQuickFilters bind:assignee bind:unread {canViewAll} />
					{#if orgTags.length > 0}
						<div class="flex flex-wrap items-center gap-1.5 pt-1">
							<button
								type="button"
								class={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors ${tag === '' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/60 bg-background text-muted-foreground hover:bg-muted'}`}
								onclick={() => (tag = '')}
							>
								All tags
							</button>
							{#each orgTags as t (t)}
								<button
									type="button"
									class={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors ${tag === t ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/60 bg-background text-muted-foreground hover:bg-muted'}`}
									onclick={() => (tag = t)}
								>
									#{t}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			{#if showSkeleton}
				<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
					<SkeletonLoader lines={6} height="72px" label="Loading conversations" />
				</div>
			{:else if showError}
				<div
					class="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-5 text-sm text-destructive shadow-card"
				>
					{errorMsg}
				</div>
			{:else if items.length === 0}
				<EmptyState icon={MessageSquare} title={emptyTitle} description={emptyDescription} />
			{:else}
				<ul class="grid gap-2.5">
					{#each items as c (c.id)}
						<li>
							<ConversationRow conversation={c} />
						</li>
					{/each}
				</ul>

				{#if nextCursor}
					<div class="flex justify-center pt-3">
						<Button variant="outline" disabled={loadingMore} onclick={loadMore}>
							{loadingMore ? 'Loading…' : 'Load more'}
						</Button>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</PageWrapper>
