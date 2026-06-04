<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Info, X, Globe, Mail, MessageSquare, Phone } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';
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
	import { getOrgContext } from '$lib/context/org';
	import {
		inboxStore,
		type SnoozePreset,
		type ThreadMessage,
		type OutboundChannel,
		type MessageMedia
	} from '$lib/stores/inbox.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { createRealtimeManager } from '$lib/stores/realtimeReconnect';

	let { data } = $props<{ data: { conversationId: string } }>();

	const member = getMemberContext();
	const org = getOrgContext();
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
		if (threadStatus === 'ready' && entry?.conversation && entry.conversation.unread_count > 0) {
			void inboxStore.markRead(id);
		}
	});

	let isRealtimeConnected = $state(true);
	let realtimeFailed = $state(false);

	$effect(() => {
		const id = data.conversationId;
		const orgId = member().org_id;
		const manager = createRealtimeManager({
			build: (supabase) =>
				supabase
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
							inboxStore.applyRealtimeMessageUpdate(payload.new);
						}
					)
					.on(
						'postgres_changes',
						{
							event: 'INSERT',
							schema: 'public',
							table: 'media',
							filter: `org_id=eq.${orgId}`
						},
						(payload: { new: Parameters<typeof inboxStore.applyRealtimeMediaInsert>[0] }) => {
							inboxStore.applyRealtimeMediaInsert(payload.new);
						}
					),
			onStatusChange: (c) => (isRealtimeConnected = c),
			onPermanentFailure: () => (realtimeFailed = true),
			onReconnect: () => inboxStore.loadThread(id, true)
		});
		return () => manager.destroy();
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
	const contactInitials = $derived(
		contact?.full_name
			.split(/\s+/)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.slice(0, 2)
			.join('') || ''
	);
	const memberInitials = $derived(
		member()
			.full_name.split(/\s+/)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.slice(0, 2)
			.join('') || ''
	);

	const channelMeta: Record<string, { label: string; icon: typeof MessageSquare; tint: string }> = {
		sms: { label: 'SMS', icon: MessageSquare, tint: 'text-muted-foreground' },
		email: { label: 'Email', icon: Mail, tint: 'text-muted-foreground' },
		webchat: { label: 'Web Chat', icon: Globe, tint: 'text-muted-foreground' }
	};

	const groupInfo = $derived.by(() => {
		return messages.map((m, i) => {
			const prev = messages[i - 1];
			if (!prev) return { grouped: false, channelChanged: false };
			const regularTypes = ['sms', 'email', 'webchat'];
			const isRegular = regularTypes.includes(m.channel ?? '');
			const prevIsRegular = regularTypes.includes(prev.channel ?? '');
			const grouped =
				isRegular &&
				prevIsRegular &&
				m.direction === prev.direction &&
				m.channel === prev.channel &&
				!m.is_internal_note &&
				!prev.is_internal_note;
			const channelChanged = isRegular && prevIsRegular && m.channel !== prev.channel;
			return { grouped, channelChanged };
		});
	});

	const availableChannels = $derived<OutboundChannel[]>(conversation?.available_channels ?? []);
	const suggestedChannel = $derived(conversation?.suggested_channel ?? null);

	const emailSubjectDefault = $derived.by(() => {
		const lastEmail = [...messages].reverse().find((m) => m.channel === 'email' && m.email_subject);
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
		opts: {
			isInternalNote: boolean;
			channel?: OutboundChannel;
			emailSubject?: string;
			interpolate?: boolean;
			mediaIds?: string[];
			optimisticMedia?: MessageMedia[];
		}
	) {
		const result = await inboxStore.sendMessage(data.conversationId, body, {
			isInternalNote: opts.isInternalNote,
			channel: opts.channel,
			emailSubject: opts.emailSubject,
			interpolate: opts.interpolate,
			mediaIds: opts.mediaIds,
			optimisticMedia: opts.optimisticMedia
		});
		if (!result.ok) {
			toast.error('Message not sent', { description: result.error });
		}
	}

	let typingDebounce: ReturnType<typeof setTimeout> | null = null;
	function handleTyping(isTyping: boolean) {
		if (typingDebounce) clearTimeout(typingDebounce);
		typingDebounce = setTimeout(
			() => {
				fetch(`/api/conversations/${data.conversationId}/typing`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ is_typing: isTyping })
				}).catch(() => {
					/* silent */
				});
			},
			isTyping ? 0 : 1000
		);
	}

	type QuickReplyItem = {
		id: string;
		title: string;
		body: string;
		channel: 'sms' | 'email' | 'webchat' | 'any';
	};
	let quickReplies = $state<QuickReplyItem[]>([]);
	onMount(async () => {
		try {
			const res = await fetch('/api/quick-replies');
			if (!res.ok) return;
			const body = (await res.json()) as { data: { items: QuickReplyItem[] } };
			quickReplies = body.data.items;
		} catch {
			// silent
		}
	});

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

	const orgTags = $derived.by(() => {
		void inboxStore.items.length;
		return inboxStore.getOrgTags();
	});

	async function handleUpdateTags(tags: string[]) {
		const result = await inboxStore.updateTags(data.conversationId, tags);
		if (!result.ok) toast.error('Tag update failed', { description: result.error });
	}

	// Day separators between message groups: "Today" / "Yesterday" / weekday
	// (within the past week) / "May 12" (older; year shown only across years).
	function isNewDay(curr: string | null, prev: string | null): boolean {
		if (!curr) return false;
		if (!prev) return true;
		return new Date(curr).toDateString() !== new Date(prev).toDateString();
	}

	function dayLabel(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		const now = new Date();
		const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
		const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
		});
	}
</script>

<svelte:head>
	<title>{contact?.full_name ?? 'Conversation'} — Inbox</title>
</svelte:head>

<div
	class="flex h-[calc(100dvh-72px-var(--bottom-nav-height)-env(safe-area-inset-bottom))] flex-col bg-muted/30 md:h-[calc(100dvh-104px)]"
>
	<!-- Header -->
	<header
		class="flex shrink-0 items-center gap-3 border-b border-border/50 bg-background px-3 py-3 sm:px-5"
	>
		<button
			class="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onclick={() => goto('/inbox')}
			aria-label="Back to inbox"
		>
			<ArrowLeft class="h-5 w-5" />
		</button>
		<div class="flex min-w-0 flex-1 items-center gap-3">
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-sm font-semibold text-primary ring-1 ring-primary/20"
			>
				{#if contactInitials}
					{contactInitials}
				{:else}
					<MessageSquare class="h-4 w-4" />
				{/if}
			</div>
			<div class="min-w-0 flex-1">
				<div class="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">
					{contact?.full_name ?? 'Loading…'}
				</div>
				{#if contact}
					<div class="truncate text-xs text-muted-foreground">{contact.phone}</div>
				{/if}
			</div>
		</div>

		{#if contact?.phone}
			<a
				href={`tel:${contact.phone}`}
				class="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label={`Call ${contact.full_name}`}
			>
				<Phone class="h-5 w-5" />
			</a>
		{/if}

		<div class="hidden lg:flex">
			<ConversationActions
				{conversation}
				canManage={canSend}
				{assignees}
				currentMemberId={member().id}
				{orgTags}
				onSnooze={handleSnooze}
				onUnsnooze={handleUnsnooze}
				onClose={handleClose}
				onReopen={handleReopen}
				onAssign={handleAssign}
				onUpdateTags={handleUpdateTags}
			/>
		</div>

		<button
			class="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
			onclick={() => (mobileContextOpen = true)}
			aria-label="View contact details"
		>
			<Info class="h-5 w-5" />
		</button>
	</header>

	{#if realtimeFailed}
		<div
			class="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-700 dark:text-amber-300"
		>
			Connection lost — refresh the page to reconnect.
		</div>
	{:else if !isRealtimeConnected}
		<div
			class="shrink-0 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-center text-xs text-amber-700 dark:text-amber-300"
		>
			Live updates paused — reconnecting…
		</div>
	{/if}

	<!-- Body -->
	<div class="flex min-h-0 flex-1">
		<!-- Thread column -->
		<div class="flex min-w-0 flex-1 flex-col">
			{#if showSkeleton}
				<div class="flex-1 overflow-hidden p-4 md:p-6">
					<div class="mx-auto max-w-3xl rounded-xl border border-border/60 bg-card p-4 shadow-card">
						<SkeletonLoader lines={8} label="Loading messages" />
					</div>
				</div>
			{:else if showError}
				<div class="flex-1 p-4 md:p-6">
					<div
						class="mx-auto max-w-3xl rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-5 text-sm text-destructive shadow-card"
					>
						{errorMsg}
					</div>
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
					class="flex-1 overflow-y-auto px-3 py-5 sm:px-5 md:px-6"
				>
					<div class="mx-auto flex max-w-3xl flex-col">
						{#if nextCursor}
							<div class="flex justify-center pb-3">
								<Button variant="outline" size="sm" disabled={loadingMore} onclick={loadMore}>
									{loadingMore ? 'Loading…' : 'Load earlier'}
								</Button>
							</div>
						{/if}
					{#each messages as m, i (m.id)}
						{@const gi = groupInfo[i]}
						{@const ch = channelMeta[m.channel ?? '']}

						{#if isNewDay(m.created_at, messages[i - 1]?.created_at ?? null)}
							<div class="flex items-center justify-center py-2">
								<span
									class="rounded-full bg-muted/80 px-3 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-border/30"
								>
									{dayLabel(m.created_at)}
								</span>
							</div>
						{/if}

						{#if gi.channelChanged}
							<div class="flex items-center justify-center pt-3 pb-1">
								<span
									class="inline-flex items-center gap-1.5 rounded-full bg-muted/80 px-3 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-border/30"
								>
									<ch.icon class="h-3.5 w-3.5" />
									Switched to {ch.label}
								</span>
							</div>
						{/if}

						<MessageBubble
							message={m}
							canRetry={canSend}
							grouped={gi.grouped}
							inboundInitials={contactInitials}
							outboundInitials={memberInitials}
						/>
					{/each}
					</div>
				</div>
			{/if}

			<!-- Composer + banners -->
			<div
				class="shrink-0 border-t border-border/50 bg-background px-3 pb-3 pt-3 shadow-[0_-10px_30px_-20px_hsl(0_0%_0%/0.18)] sm:px-5"
			>
				<div class="mx-auto max-w-3xl">
					{#if optedOut && !isClosed && availableChannels.length === 1 && availableChannels[0] === 'sms'}
						<div class="mb-2">
							<OptOutBanner />
						</div>
					{/if}
					<Composer
						{availableChannels}
						{suggestedChannel}
						{emailSubjectDefault}
						{canSend}
						smsOptOut={optedOut}
						{isClosed}
						smsQuota={context?.sms_quota ?? null}
						{quickReplies}
						contactName={contact?.full_name ?? ''}
						orgName={org().name}
						contactId={contact?.id ?? ''}
						onSend={handleSend}
						onTyping={handleTyping}
					/>
				</div>
			</div>
		</div>

		<!-- Desktop context sidebar -->
		<aside
			class="hidden w-80 shrink-0 overflow-y-auto border-l border-border/50 bg-background px-4 py-4 lg:block"
		>
			<ContactContextPanel {contact} {context} />
		</aside>
	</div>
</div>

<!-- Mobile context sheet -->
<Sheet.Root bind:open={mobileContextOpen}>
	<Sheet.Content side="right" class="w-[85vw] sm:max-w-md">
		<div class="flex items-center justify-between border-b border-border/60 pb-3">
			<h2 class="text-base font-semibold tracking-tight">Details</h2>
			<button
				class="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
				{orgTags}
				onSnooze={handleSnooze}
				onUnsnooze={handleUnsnooze}
				onClose={handleClose}
				onReopen={handleReopen}
				onAssign={handleAssign}
				onUpdateTags={handleUpdateTags}
			/>
			<ContactContextPanel {contact} {context} />
		</div>
	</Sheet.Content>
</Sheet.Root>
