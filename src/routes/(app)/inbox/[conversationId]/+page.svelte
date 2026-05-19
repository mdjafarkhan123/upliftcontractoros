<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Info, X, MessageSquare } from '@lucide/svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Sheet from '$lib/components/ui/sheet';
	import MessageBubble from '$lib/components/inbox/MessageBubble.svelte';
	import Composer from '$lib/components/inbox/Composer.svelte';
	import ContactContextPanel from '$lib/components/inbox/ContactContextPanel.svelte';
	import OptOutBanner from '$lib/components/inbox/OptOutBanner.svelte';
	import ConversationActions from '$lib/components/inbox/ConversationActions.svelte';
	import { getMemberContext } from '$lib/context/member';
	import {
		inboxStore,
		type SnoozePreset,
		type ThreadMessage,
		type OutboundChannel
	} from '$lib/stores/inbox.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { getBrowserSupabase, realtimeAuthReady } from '$lib/supabase/browser';

	let { data } = $props<{ data: { conversationId: string } }>();

	const member = getMemberContext();
	const canSend = $derived(member().can_send_messages);
	const canViewTeam = $derived(member().can_view_team_members);

	let mobileContextOpen = $state(false);
	let assignees = $state<Array<{ id: string; full_name: string }>>([]);

	$effect(() => {
		const id = data.conversationId;
		void inboxStore.loadThread(id);
	});

	$effect(() => {
		const id = data.conversationId;
		const threadStatus = inboxStore.threadStatus(id);
		const entry = inboxStore.getThread(id);
		if (
			threadStatus === 'ready' &&
			entry?.conversation &&
			entry.conversation.unread_count > 0
		) {
			void inboxStore.markRead(id);
		}
	});

	$effect(() => {
		const id = data.conversationId;
		const supabase = getBrowserSupabase();
		let cancelled = false;
		let channel: ReturnType<typeof supabase.channel> | null = null;
		void realtimeAuthReady().then(() => {
			if (cancelled) return;
			channel = supabase
				.channel(`thread:${id}`)
				.on(
					'postgres_changes',
					{
						event: 'INSERT',
						schema: 'public',
						table: 'messages',
						filter: `conversation_id=eq.${id}`
					},
					(payload: { new: ThreadMessage }) => {
						console.log('[realtime:thread] INSERT', payload.new);
						inboxStore.applyRealtimeMessageInsert(payload.new);
					}
				)
				.on(
					'postgres_changes',
					{
						event: 'UPDATE',
						schema: 'public',
						table: 'messages',
						filter: `conversation_id=eq.${id}`
					},
					(payload: { new: ThreadMessage }) => {
						console.log('[realtime:thread] UPDATE', payload.new);
						inboxStore.applyRealtimeMessageUpdate(payload.new);
					}
				)
				.subscribe((status, err) => console.log('[realtime:thread] status', status, err));
		});
		return () => {
			cancelled = true;
			if (channel) void supabase.removeChannel(channel);
		};
	});

	onMount(async () => {
		if (!canViewTeam) return;
		try {
			const res = await fetch('/api/team');
			if (!res.ok) return;
			const body = (await res.json()) as { data: Array<{ id: string; full_name: string }> };
			assignees = body.data;
		} catch {
			// silent — assignment menu just won't show team list
		}
	});

	const entry = $derived(inboxStore.getThread(data.conversationId));
	const threadStatus = $derived(inboxStore.threadStatus(data.conversationId));
	const errorMsg = $derived(inboxStore.threadError(data.conversationId));

	const conversation = $derived(entry?.conversation ?? null);
	const contact = $derived(entry?.contact ?? null);
	const context = $derived(entry?.context ?? null);
	const messages = $derived(entry?.messages ?? []);
	const nextCursor = $derived(entry?.nextCursor ?? null);

	const showSkeleton = $derived(threadStatus === 'loading' && messages.length === 0);
	const showError = $derived(threadStatus === 'error' && messages.length === 0);

	const optedOut = $derived(contact?.sms_opt_out === true);
	const isClosed = $derived(conversation?.status === 'closed');

	const availableChannels = $derived<OutboundChannel[]>(conversation?.available_channels ?? []);
	const suggestedChannel = $derived(conversation?.suggested_channel ?? null);

	const emailSubjectDefault = $derived.by(() => {
		const lastEmail = [...messages]
			.reverse()
			.find((m) => m.channel === 'email' && m.email_subject);
		if (lastEmail?.email_subject) {
			return lastEmail.email_subject.startsWith('Re:')
				? lastEmail.email_subject
				: `Re: ${lastEmail.email_subject}`;
		}
		return conversation?.subject ?? '';
	});

	let scrollEl: HTMLDivElement | null = $state(null);
	$effect(() => {
		void messages.length;
		if (scrollEl) {
			scrollEl.scrollTop = scrollEl.scrollHeight;
		}
	});

	let loadingMore = $state(false);
	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		const prevHeight = scrollEl?.scrollHeight ?? 0;
		await inboxStore.loadMoreThreadMessages(data.conversationId);
		queueMicrotask(() => {
			if (scrollEl) {
				const next = scrollEl.scrollHeight;
				scrollEl.scrollTop = next - prevHeight;
			}
		});
		loadingMore = false;
	}

	async function handleSend(
		body: string,
		opts: { isInternalNote: boolean; channel?: OutboundChannel; emailSubject?: string }
	) {
		const result = await inboxStore.sendMessage(data.conversationId, body, {
			isInternalNote: opts.isInternalNote,
			channel: opts.channel,
			emailSubject: opts.emailSubject
		});
		if (!result.ok) {
			toast.error('Message not sent', { description: result.error });
		}
	}

	async function handleSnooze(preset: SnoozePreset) {
		const result = await inboxStore.snooze(data.conversationId, preset);
		if (!result.ok) toast.error('Snooze failed', { description: result.error });
		else toast.success('Conversation snoozed');
	}

	async function handleUnsnooze() {
		const result = await inboxStore.unsnooze(data.conversationId);
		if (!result.ok) toast.error('Unsnooze failed', { description: result.error });
	}

	async function handleClose() {
		const result = await inboxStore.setStatus(data.conversationId, 'closed');
		if (!result.ok) toast.error('Close failed', { description: result.error });
		else toast.success('Conversation closed');
	}

	async function handleReopen() {
		const result = await inboxStore.setStatus(data.conversationId, 'open');
		if (!result.ok) toast.error('Reopen failed', { description: result.error });
	}

	async function handleAssign(memberId: string | null, name: string | null) {
		const result = await inboxStore.setAssignee(data.conversationId, memberId, name);
		if (!result.ok) toast.error('Assignment failed', { description: result.error });
	}
</script>

<svelte:head>
	<title>{contact?.full_name ?? 'Conversation'} — Inbox</title>
</svelte:head>

<div class="flex h-[100dvh] flex-col bg-background">
	<!-- Header -->
	<header
		class="flex shrink-0 items-center gap-2 border-b border-border bg-card/60 px-3 py-2 backdrop-blur"
	>
		<button
			class="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent/40"
			onclick={() => goto('/inbox')}
			aria-label="Back to inbox"
		>
			<ArrowLeft class="h-5 w-5" />
		</button>
		<div class="min-w-0 flex-1">
			<div class="truncate text-sm font-semibold text-foreground">
				{contact?.full_name ?? 'Loading…'}
			</div>
			{#if contact}
				<div class="truncate text-xs text-muted-foreground">{contact.phone}</div>
			{/if}
		</div>

		<div class="hidden lg:flex">
			<ConversationActions
				{conversation}
				canManage={canSend}
				{assignees}
				currentMemberId={member().id}
				onSnooze={handleSnooze}
				onUnsnooze={handleUnsnooze}
				onClose={handleClose}
				onReopen={handleReopen}
				onAssign={handleAssign}
			/>
		</div>

		<button
			class="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent/40 lg:hidden"
			onclick={() => (mobileContextOpen = true)}
			aria-label="View contact details"
		>
			<Info class="h-5 w-5" />
		</button>
	</header>

	<!-- Body -->
	<div class="flex min-h-0 flex-1">
		<!-- Thread column -->
		<div class="flex min-w-0 flex-1 flex-col">
			{#if showSkeleton}
				<div class="flex-1 overflow-hidden p-4">
					<SkeletonLoader lines={8} label="Loading messages" />
				</div>
			{:else if showError}
				<div class="flex-1 p-4">
					<p class="text-sm text-destructive">{errorMsg}</p>
				</div>
			{:else if messages.length === 0}
				<div class="flex flex-1 items-center justify-center p-4">
					<EmptyState
						icon={MessageSquare}
						title="No messages yet"
						description="Send a message to start the conversation."
					/>
				</div>
			{:else}
				<div
					bind:this={scrollEl}
					class="flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-4"
				>
					{#if nextCursor}
						<div class="flex justify-center pb-2">
							<Button variant="outline" size="sm" disabled={loadingMore} onclick={loadMore}>
								{loadingMore ? 'Loading…' : 'Load earlier'}
							</Button>
						</div>
					{/if}
					{#each messages as m (m.id)}
						<MessageBubble message={m} canRetry={canSend} />
					{/each}
				</div>
			{/if}

			<!-- Composer + banners -->
			<div
				class="shrink-0 border-t border-border bg-card/60 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur sm:px-4"
			>
				{#if optedOut && !isClosed && availableChannels.length === 1 && availableChannels[0] === 'sms'}
					<div class="mb-2">
						<OptOutBanner />
					</div>
				{/if}
				<Composer
					availableChannels={availableChannels}
					suggestedChannel={suggestedChannel}
					emailSubjectDefault={emailSubjectDefault}
					canSend={canSend}
					smsOptOut={optedOut}
					isClosed={isClosed}
					onSend={handleSend}
				/>
			</div>
		</div>

		<!-- Desktop context sidebar -->
		<aside
			class="hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-background/40 px-4 py-4 lg:block"
		>
			<ContactContextPanel {contact} {context} />
		</aside>
	</div>
</div>

<!-- Mobile context sheet -->
<Sheet.Root bind:open={mobileContextOpen}>
	<Sheet.Content side="right" class="w-[85vw] sm:max-w-md">
		<div class="flex items-center justify-between pb-3">
			<h2 class="text-base font-semibold">Details</h2>
			<button
				class="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/40"
				onclick={() => (mobileContextOpen = false)}
				aria-label="Close"
			>
				<X class="h-4 w-4" />
			</button>
		</div>
		<div class="space-y-4">
			<ConversationActions
				{conversation}
				canManage={canSend}
				{assignees}
				currentMemberId={member().id}
				onSnooze={handleSnooze}
				onUnsnooze={handleUnsnooze}
				onClose={handleClose}
				onReopen={handleReopen}
				onAssign={handleAssign}
			/>
			<ContactContextPanel {contact} {context} />
		</div>
	</Sheet.Content>
</Sheet.Root>
