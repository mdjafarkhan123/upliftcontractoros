<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowLeft, MoreHorizontal, Info, X } from '@lucide/svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Sheet from '$lib/components/ui/sheet';
	import MessageBubble from '$lib/components/inbox/MessageBubble.svelte';
	import Composer from '$lib/components/inbox/Composer.svelte';
	import ContactContextPanel from '$lib/components/inbox/ContactContextPanel.svelte';
	import OptOutBanner from '$lib/components/inbox/OptOutBanner.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { inboxStore, type ThreadMessage } from '$lib/stores/inbox.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { getBrowserSupabase } from '$lib/supabase/browser';
	import { MessageSquare } from '@lucide/svelte';

	let { data } = $props<{ data: { conversationId: string } }>();

	const member = getMemberContext();
	const canSend = $derived(member().can_send_messages);

	let mobileContextOpen = $state(false);

	$effect(() => {
		const id = data.conversationId;
		void inboxStore.loadThread(id);
	});

	// Mark read whenever a thread becomes ready
	$effect(() => {
		const id = data.conversationId;
		const status = inboxStore.threadStatus(id);
		const entry = inboxStore.getThread(id);
		if (status === 'ready' && entry?.conversation && entry.conversation.unread_count > 0) {
			void inboxStore.markRead(id);
		}
	});

	// Page-scoped Realtime subscription for this conversation. Reconciles
	// directly into the store cache — never wipes and refetches.
	$effect(() => {
		const id = data.conversationId;
		const supabase = getBrowserSupabase();
		const channel = supabase
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
			.subscribe((status, err) => {
				if (status !== 'SUBSCRIBED') {
					console.warn('[realtime inbox:thread]', status, err);
				}
			});
		return () => {
			void supabase.removeChannel(channel);
		};
	});

	const entry = $derived(inboxStore.getThread(data.conversationId));
	const status = $derived(inboxStore.threadStatus(data.conversationId));
	const errorMsg = $derived(inboxStore.threadError(data.conversationId));

	const conversation = $derived(entry?.conversation ?? null);
	const contact = $derived(entry?.contact ?? null);
	const context = $derived(entry?.context ?? null);
	const messages = $derived(entry?.messages ?? []);
	const nextCursor = $derived(entry?.nextCursor ?? null);

	const showSkeleton = $derived(status === 'loading' && messages.length === 0);
	const showError = $derived(status === 'error' && messages.length === 0);

	const optedOut = $derived(contact?.sms_opt_out === true);
	const isMissedCallChannel = $derived(conversation?.channel === 'missed_call');
	const isWebchatChannel = $derived(conversation?.channel === 'webchat');

	const composerDisabledReason = $derived.by(() => {
		if (!canSend) return 'You do not have permission to send messages.';
		if (optedOut && !isWebchatChannel) return 'Contact has opted out of SMS.';
		if (isMissedCallChannel) return 'Use a regular SMS conversation to reply.';
		return undefined;
	});

	// Anchor a "scroll to bottom" effect when messages change.
	let scrollEl: HTMLDivElement | null = $state(null);
	$effect(() => {
		void messages.length; // dependency
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
		// Preserve scroll anchor after prepending older messages
		queueMicrotask(() => {
			if (scrollEl) {
				const next = scrollEl.scrollHeight;
				scrollEl.scrollTop = next - prevHeight;
			}
		});
		loadingMore = false;
	}

	async function handleSend(body: string, isInternalNote: boolean) {
		const result = await inboxStore.sendMessage(data.conversationId, body, {
			isInternalNote
		});
		if (!result.ok) {
			toast.error('Message not sent', { description: result.error });
		}
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
		<button
			class="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent/40 lg:hidden"
			onclick={() => (mobileContextOpen = true)}
			aria-label="View contact details"
		>
			<Info class="h-5 w-5" />
		</button>
		<button
			class="hidden lg:inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/40"
			aria-label="More actions"
		>
			<MoreHorizontal class="h-5 w-5" />
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
						<MessageBubble message={m} />
					{/each}
				</div>
			{/if}

			<!-- Composer + banners -->
			<div class="shrink-0 border-t border-border bg-card/60 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur sm:px-4">
				{#if optedOut && !isWebchatChannel}
					<div class="mb-2">
						<OptOutBanner />
					</div>
				{/if}
				<Composer
					disabled={(optedOut && !isWebchatChannel) || isMissedCallChannel}
					disabledReason={composerDisabledReason}
					canSend={canSend}
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
		<ContactContextPanel {contact} {context} />
	</Sheet.Content>
</Sheet.Root>
