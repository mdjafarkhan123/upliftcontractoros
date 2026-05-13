<script lang="ts">
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import InboxFilters from '$lib/components/inbox/InboxFilters.svelte';
	import InboxSearchBar from '$lib/components/inbox/InboxSearchBar.svelte';
	import ConversationRow from '$lib/components/inbox/ConversationRow.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { inboxStore, type InboxFilter } from '$lib/stores/inbox.svelte';
	import { getBrowserSupabase } from '$lib/supabase/browser';
	import type { ThreadMessage } from '$lib/stores/inbox.svelte';
	import { MessageSquare } from '@lucide/svelte';

	let { data } = $props<{ data: { filter: InboxFilter; q: string } }>();

	const member = getMemberContext();
	const canView = $derived(
		member().can_view_all_conversations || member().can_view_assigned_conversations
	);

	let filter = $state<InboxFilter>(data.filter);
	let search = $state(data.q);
	const filters = $derived({ filter, q: search });

	$effect(() => {
		if (!canView) return;
		void inboxStore.loadList(filters);
	});

	const items = $derived(inboxStore.items);
	const nextCursor = $derived(inboxStore.nextCursor);
	const status = $derived(inboxStore.listStatus);
	const errorMsg = $derived(inboxStore.listError);
	const showSkeleton = $derived(status === 'loading' && items.length === 0);
	const showError = $derived(status === 'error' && items.length === 0);

	let loadingMore = $state(false);
	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		await inboxStore.loadMoreList(filters);
		loadingMore = false;
	}

	// Org-wide Realtime subscription on messages: keeps list previews + unread
	// counts fresh as new messages arrive. The thread page reuses the same
	// reconciler when its own page-scoped subscription fires.
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
		if (filter === 'unread') return 'All caught up';
		if (filter === 'sms') return 'No SMS conversations yet';
		if (filter === 'missed_calls') return 'No missed calls';
		return 'No conversations yet';
	});

	const emptyDescription = $derived.by(() => {
		if (search.trim()) return 'Try a different name.';
		if (filter === 'unread') return 'You have no unread messages.';
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
			<InboxSearchBar bind:value={search} />
			<InboxFilters bind:value={filter} />

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
