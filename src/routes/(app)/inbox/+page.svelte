<script lang="ts">
	import { onMount } from 'svelte';
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
	import { getBrowserSupabase, realtimeAuthReady } from '$lib/supabase/browser';

	let {
		data
	} = $props<{
		data: { status: StatusFilter; assignee: AssigneeFilter; unread: boolean; q: string };
	}>();

	const member = getMemberContext();
	const canView = $derived(
		member().can_view_all_conversations || member().can_view_assigned_conversations
	);
	const canViewAll = $derived(member().can_view_all_conversations);

	let status = $state<StatusFilter>(data.status);
	let assignee = $state<AssigneeFilter>(data.assignee);
	let unread = $state<boolean>(data.unread);
	let search = $state(data.q);

	const filters = $derived({ status, assignee, unread, q: search });

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

	onMount(() => {
		if (!canView) return;
		const supabase = getBrowserSupabase();
		let cancelled = false;
		let channel: ReturnType<typeof supabase.channel> | null = null;
		void realtimeAuthReady().then(() => {
			if (cancelled) return;
			channel = supabase
				.channel(`inbox:org:${member().org_id}`)
				.on(
					'postgres_changes',
					{
						event: 'INSERT',
						schema: 'public',
						table: 'messages',
						filter: `org_id=eq.${member().org_id}`
					},
					(payload: { new: ThreadMessage }) => {
						console.log('[realtime:inbox] INSERT', payload.new);
						inboxStore.applyRealtimeMessageInsert(payload.new);
					}
				)
				.on(
					'postgres_changes',
					{
						event: 'UPDATE',
						schema: 'public',
						table: 'messages',
						filter: `org_id=eq.${member().org_id}`
					},
					(payload: { new: ThreadMessage }) => {
						console.log('[realtime:inbox] UPDATE', payload.new);
						inboxStore.applyRealtimeMessageUpdate(payload.new);
					}
				)
				.subscribe((status, err) => console.log('[realtime:inbox] status', status, err));
		});
		return () => {
			cancelled = true;
			if (channel) void supabase.removeChannel(channel);
		};
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

				<div class="mt-3 flex flex-col gap-2">
					<InboxFilters bind:value={status} />
					<InboxQuickFilters bind:assignee={assignee} bind:unread={unread} canViewAll={canViewAll} />
				</div>
			</div>

			{#if showSkeleton}
				<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
					<SkeletonLoader lines={6} height="72px" label="Loading conversations" />
				</div>
			{:else if showError}
				<div class="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-5 text-sm text-destructive shadow-card">
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
