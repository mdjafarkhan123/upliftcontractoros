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
	import { getBrowserSupabase } from '$lib/supabase/browser';

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
		const channel = supabase
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
					inboxStore.applyRealtimeMessageInsert(payload.new);
				}
			)
			.subscribe();
		return () => {
			void supabase.removeChannel(channel);
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

<PageWrapper title="Inbox" subtitle="Stay connected with every customer">
	{#if !canView}
		<EmptyState
			icon={MessageSquare}
			title="No access"
			description="You don't have permission to view conversations."
		/>
	{:else}
		<div class="space-y-4">
			<div class="relative">
				<Search
					class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					type="search"
					inputmode="search"
					placeholder="Search by contact name"
					class="pl-10"
					bind:value={search}
				/>
			</div>

			<InboxFilters bind:value={status} />
			<InboxQuickFilters bind:assignee={assignee} bind:unread={unread} canViewAll={canViewAll} />

			{#if showSkeleton}
				<SkeletonLoader lines={6} label="Loading conversations" />
			{:else if showError}
				<p class="text-sm text-destructive">{errorMsg}</p>
			{:else if items.length === 0}
				<EmptyState icon={MessageSquare} title={emptyTitle} description={emptyDescription} />
			{:else}
				<ul class="grid gap-2">
					{#each items as c (c.id)}
						<li>
							<ConversationRow conversation={c} />
						</li>
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
	{/if}
</PageWrapper>
