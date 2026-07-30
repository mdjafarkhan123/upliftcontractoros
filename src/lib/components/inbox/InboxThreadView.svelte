<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import * as Sheet from '$lib/components/ui/sheet';
	import MessageBubble from '$lib/components/inbox/MessageBubble.svelte';
	import LogCallSheet from '$lib/components/inbox/LogCallSheet.svelte';
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
		type MessageMedia,
		type CallOutcome
	} from '$lib/stores/inbox.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { createRealtimeManager } from '$lib/stores/realtimeReconnect';

	let {
		conversationId,
		showBackButton = true,
		fill = false
	}: {
		conversationId: string;
		/** Hide the back arrow (e.g. when embedded in a two-pane desktop layout where
		 *  the list is right next to it). Default true. */
		showBackButton?: boolean;
		/** Fill the parent height (used when embedded in the two-pane right panel).
		 *  When false (default), the thread view fills the viewport directly. */
		fill?: boolean;
	} = $props();

	const member = getMemberContext();
	const org = getOrgContext();
	const canSend = $derived(member().can_send_messages);
	const canViewTeam = $derived(member().can_view_team_members);

	let mobileContextOpen = $state(false);
	let assignees = $state<Array<{ id: string; full_name: string }>>([]);

	$effect(() => {
		const id = conversationId;
		void inboxStore.loadThread(id);
	});

	$effect(() => {
		const id = conversationId;
		const threadStatus = inboxStore.threadStatus(id);
		const entry = inboxStore.getThread(id);
		if (threadStatus === 'ready' && entry?.conversation && entry.conversation.unread_count > 0) {
			void inboxStore.markRead(id);
		}
	});

	let isRealtimeConnected = $state(true);
	let realtimeFailed = $state(false);

	let mounted = $state(false);
	let isXl = $state(false);
	let showContext = $state(true);

	onMount(() => {
		mounted = true;
		const mq = window.matchMedia('(min-width: 1280px)');
		isXl = mq.matches;
		const onChange = (e: MediaQueryListEvent) => (isXl = e.matches);
		mq.addEventListener('change', onChange);
		try {
			if (localStorage.getItem('inbox:context-panel') === '0') showContext = false;
		} catch {
			/* localStorage unavailable; keep default */
		}
		return () => mq.removeEventListener('change', onChange);
	});

	function toggleContext() {
		showContext = !showContext;
		try {
			localStorage.setItem('inbox:context-panel', showContext ? '1' : '0');
		} catch {
			/* ignore */
		}
	}

	const showAside = $derived(mounted && isXl && showContext);

	$effect(() => {
		const id = conversationId;
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

	const entry = $derived(inboxStore.getThread(conversationId));
	const threadStatus = $derived(inboxStore.threadStatus(conversationId));
	const errorMsg = $derived(inboxStore.threadError(conversationId));

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

	const channelMeta: Record<string, { label: string; icon: string }> = {
		sms: { label: 'SMS', icon: 'ri-chat-1-line' },
		email: { label: 'Email', icon: 'ri-mail-line' },
		webchat: { label: 'Web Chat', icon: 'ri-global-line' }
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
		await inboxStore.loadMoreThreadMessages(conversationId);
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
			fromLocalPart?: string;
			interpolate?: boolean;
			mediaIds?: string[];
			optimisticMedia?: MessageMedia[];
		}
	) {
		const result = await inboxStore.sendMessage(conversationId, body, {
			isInternalNote: opts.isInternalNote,
			channel: opts.channel,
			emailSubject: opts.emailSubject,
			fromLocalPart: opts.fromLocalPart,
			interpolate: opts.interpolate,
			mediaIds: opts.mediaIds,
			optimisticMedia: opts.optimisticMedia
		});
		if (!result.ok) {
			toast.error('Message not sent', { description: result.error });
		}
	}

	const CALL_MIN_AWAY_SECONDS = 5;
	const CALL_MAX_AWAY_SECONDS = 300;
	let callLogOpen = $state(false);
	let callAwaySeconds = $state(0);
	let callArmed = false;
	let callLeftAt = 0;

	function armCallDetection() {
		if (!canSend) return;
		callArmed = true;
		callLeftAt = Date.now();
	}

	function openLogCallManual() {
		callArmed = false;
		callAwaySeconds = 0;
		callLogOpen = true;
	}

	onMount(() => {
		function onVisibility() {
			if (document.visibilityState !== 'visible' || !callArmed) return;
			callArmed = false;
			const away = (Date.now() - callLeftAt) / 1000;
			if (away >= CALL_MIN_AWAY_SECONDS && away <= CALL_MAX_AWAY_SECONDS) {
				callAwaySeconds = Math.round(away);
				callLogOpen = true;
			}
		}
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	});

	async function handleLogCall(payload: {
		outcome: CallOutcome;
		durationSeconds: number | null;
		body: string;
	}) {
		const result = await inboxStore.logCall(conversationId, {
			outcome: payload.outcome,
			durationSeconds: payload.durationSeconds,
			body: payload.body
		});
		if (!result.ok) toast.error('Call not logged', { description: result.error });
	}

	let typingDebounce: ReturnType<typeof setTimeout> | null = null;
	function handleTyping(isTyping: boolean) {
		if (typingDebounce) clearTimeout(typingDebounce);
		typingDebounce = setTimeout(
			() => {
				fetch(`/api/conversations/${conversationId}/typing`, {
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
		const result = await inboxStore.snooze(conversationId, preset);
		if (!result.ok) toast.error('Snooze failed', { description: result.error });
		else toast.success('Conversation snoozed');
	}

	async function handleUnsnooze() {
		const result = await inboxStore.unsnooze(conversationId);
		if (!result.ok) toast.error('Unsnooze failed', { description: result.error });
	}

	async function handleClose() {
		const result = await inboxStore.setStatus(conversationId, 'closed');
		if (!result.ok) toast.error('Close failed', { description: result.error });
		else toast.success('Conversation closed');
	}

	async function handleReopen() {
		const result = await inboxStore.setStatus(conversationId, 'open');
		if (!result.ok) toast.error('Reopen failed', { description: result.error });
	}

	async function handleAssign(memberId: string | null, name: string | null) {
		const result = await inboxStore.setAssignee(conversationId, memberId, name);
		if (!result.ok) toast.error('Assignment failed', { description: result.error });
	}

	const orgTags = $derived.by(() => {
		void inboxStore.items.length;
		return inboxStore.getOrgTags();
	});

	async function handleUpdateTags(tags: string[]) {
		const result = await inboxStore.updateTags(conversationId, tags);
		if (!result.ok) toast.error('Tag update failed', { description: result.error });
	}

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

<div class="thread" class:thread--fill={fill}>
	<header class="thread__header">
		{#if showBackButton}
			<button
				class="thread__icon-btn"
				onclick={() => goto(resolve('/inbox'))}
				aria-label="Back to inbox"
			>
				<i class="ri-arrow-left-line" aria-hidden="true"></i>
			</button>
		{/if}
		<div class="thread__identity">
			<div class="thread__avatar">
				{#if contactInitials}
					{contactInitials}
				{:else}
					<i class="ri-chat-1-line" aria-hidden="true"></i>
				{/if}
			</div>
			<div>
				<div class="thread__name">{contact?.full_name ?? 'Loading…'}</div>
				{#if contact}
					<div class="thread__phone">{contact.phone}</div>
				{/if}
			</div>
		</div>

		<div class="thread__header-actions">
			{#if contact?.phone}
				<a
					href={`tel:${contact.phone}`}
					onclick={armCallDetection}
					class="btn btn--primary btn--sm"
					aria-label={`Call ${contact.full_name}`}
				>
					<i class="ri-phone-line" aria-hidden="true"></i>
					<span>Call</span>
				</a>
				{#if canSend}
					<button
						onclick={openLogCallManual}
						class="btn btn--outline btn--sm"
						aria-label="Log a call"
					>
						<i class="ri-draft-line" aria-hidden="true"></i>
						<span>Log call</span>
					</button>
				{/if}
			{/if}

			<div class="thread__actions-desktop">
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
				class="thread__icon-btn thread__icon-btn--mobile"
				onclick={() => (mobileContextOpen = true)}
				aria-label="View contact details"
			>
				<i class="ri-information-line" aria-hidden="true"></i>
			</button>

			<button
				class="thread__icon-btn thread__icon-btn--desktop"
				onclick={toggleContext}
				aria-label={showContext ? 'Hide contact details' : 'Show contact details'}
				aria-pressed={showContext}
				title={showContext ? 'Hide contact details' : 'Show contact details'}
			>
				<i class={showContext ? 'ri-side-bar-line' : 'ri-side-bar-fill'} aria-hidden="true"></i>
			</button>
		</div>
	</header>

	{#if realtimeFailed}
		<div class="inbox-banner">Connection lost — refresh the page to reconnect.</div>
	{:else if !isRealtimeConnected}
		<div class="inbox-banner inbox-banner--muted">Live updates paused — reconnecting…</div>
	{/if}

	<div class="thread__body">
		<div class="thread__main">
			{#if showSkeleton}
				<div class="thread__loading">
					<SkeletonLoader lines={8} label="Loading messages" />
				</div>
			{:else if showError}
				<div class="thread__error-wrap">
					<div class="thread__error">{errorMsg}</div>
				</div>
			{:else if messages.length === 0}
				<div class="thread__empty">
					<EmptyState
						iconClass="ri-chat-3-line"
						title="No messages yet"
						description="Send a message to start the conversation."
					/>
				</div>
			{:else}
				<div bind:this={scrollEl} class="thread__scroll">
					<div class="thread__messages">
						{#if nextCursor}
							<div class="thread__more">
								<button
									type="button"
									class="btn btn--outline btn--sm"
									disabled={loadingMore}
									onclick={loadMore}
								>
									{loadingMore ? 'Loading…' : 'Load earlier'}
								</button>
							</div>
						{/if}
						{#each messages as m, i (m.id)}
							{@const gi = groupInfo[i]}
							{@const ch = channelMeta[m.channel ?? '']}

							{#if isNewDay(m.created_at, messages[i - 1]?.created_at ?? null)}
								<div class="thread__sep">
									<span class="thread__sep-label">{dayLabel(m.created_at)}</span>
								</div>
							{/if}

							{#if gi.channelChanged}
								<div class="thread__sep">
									<span class="thread__sep-label">
										<i class={ch.icon} aria-hidden="true"></i>
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
								outboundName={member().full_name}
								contactId={contact?.id ?? ''}
								contactName={contact?.full_name ?? ''}
							/>
						{/each}
					</div>
				</div>
			{/if}

			<div class="thread__composer">
				{#if optedOut && !isClosed && availableChannels.length === 1 && availableChannels[0] === 'sms'}
					<div class="thread__optout">
						<OptOutBanner />
					</div>
				{/if}
				<Composer
					{availableChannels}
					{suggestedChannel}
					{emailSubjectDefault}
					{canSend}
					smsOptOut={optedOut}
					doNotContact={contact?.do_not_contact === true}
					{isClosed}
					smsQuota={context?.sms_quota ?? null}
					{quickReplies}
					contactName={contact?.full_name ?? ''}
					orgName={org().name}
					orgSlug={org().slug}
					contactId={contact?.id ?? ''}
					onSend={handleSend}
					onTyping={handleTyping}
				/>
			</div>
		</div>

		<aside class="thread__aside" class:thread__aside--open={showAside}>
			<ContactContextPanel {contact} {context} />
		</aside>
	</div>
</div>

<LogCallSheet
	bind:open={callLogOpen}
	contactName={contact?.full_name ?? ''}
	prefillSeconds={callAwaySeconds}
	onLog={handleLogCall}
	onDismiss={() => {}}
/>

<Sheet.Root bind:open={mobileContextOpen}>
	<Sheet.Content side="right" class="dialog-sheet thread__sheet">
		<div class="thread__sheet-head">
			<h2 class="thread__sheet-title">Details</h2>
			<button
				class="thread__icon-btn"
				onclick={() => (mobileContextOpen = false)}
				aria-label="Close"
			>
				<i class="ri-close-line" aria-hidden="true"></i>
			</button>
		</div>
		<div class="thread__sheet-body">
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
