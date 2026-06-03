<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ArrowLeft, MessageSquare, Phone } from '@lucide/svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import Composer from '$lib/components/inbox/Composer.svelte';
	import OptOutBanner from '$lib/components/inbox/OptOutBanner.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getOrgContext } from '$lib/context/org';
	import { inboxStore, type OutboundChannel } from '$lib/stores/inbox.svelte';
	import { toast } from '$lib/stores/toast.svelte';

	let { data } = $props<{
		data: { contactId: string; contactName: string; contactPhone: string };
	}>();

	const member = getMemberContext();
	const org = getOrgContext();
	const canSend = $derived(member().can_send_messages);

	type DraftContext = {
		contact: { id: string; full_name: string; phone: string; sms_opt_out: boolean };
		available_channels: OutboundChannel[];
		suggested_channel: OutboundChannel | null;
		sms_quota: { used: number; limit: number };
	};

	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let draft = $state<DraftContext | null>(null);

	// Fall back to the querystring name/phone so the header renders instantly while
	// the resolve request is in flight.
	const headerName = $derived(draft?.contact.full_name ?? data.contactName ?? '');
	const headerPhone = $derived(draft?.contact.phone ?? data.contactPhone ?? '');
	const contactInitials = $derived(
		headerName
			.split(/\s+/)
			.map((p: string) => p[0]?.toUpperCase() ?? '')
			.slice(0, 2)
			.join('') || ''
	);

	const optedOut = $derived(draft?.contact.sms_opt_out === true);
	const availableChannels = $derived<OutboundChannel[]>(draft?.available_channels ?? []);
	const suggestedChannel = $derived(draft?.suggested_channel ?? null);

	onMount(async () => {
		if (!data.contactId) {
			void goto('/inbox', { replaceState: true });
			return;
		}
		try {
			const res = await fetch(`/api/conversations/resolve?contact_id=${data.contactId}`);
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				loadError = body.error ?? 'Failed to open conversation';
				loading = false;
				return;
			}
			const body = (await res.json()) as {
				data: DraftContext & { conversation_id: string | null };
			};
			// Existing conversation — open the real thread instead of drafting.
			if (body.data.conversation_id) {
				void goto(`/inbox/${body.data.conversation_id}`, { replaceState: true });
				return;
			}
			draft = {
				contact: body.data.contact,
				available_channels: body.data.available_channels,
				suggested_channel: body.data.suggested_channel,
				sms_quota: body.data.sms_quota
			};
			loading = false;
		} catch {
			loadError = 'Failed to open conversation';
			loading = false;
		}
	});

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

	let starting = $state(false);
	async function handleSend(
		body: string,
		opts: {
			isInternalNote: boolean;
			channel?: OutboundChannel;
			emailSubject?: string;
			interpolate?: boolean;
			mediaIds?: string[];
		}
	) {
		if (starting) return;
		starting = true;
		try {
			// Create/reopen the conversation only now — on the first actual send.
			const startRes = await fetch('/api/conversations/start', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ contact_id: data.contactId })
			});
			const startBody = (await startRes.json().catch(() => ({}))) as {
				data?: { conversation_id: string };
				error?: string;
			};
			if (!startRes.ok || !startBody.data) {
				toast.error('Could not start conversation', { description: startBody.error });
				return;
			}
			const conversationId = startBody.data.conversation_id;

			const result = await inboxStore.sendMessage(conversationId, body, {
				isInternalNote: opts.isInternalNote,
				channel: opts.channel,
				emailSubject: opts.emailSubject,
				interpolate: opts.interpolate,
				mediaIds: opts.mediaIds
			});
			if (!result.ok) {
				toast.error('Message not sent', { description: result.error });
			}
			// Land on the real thread either way so the user can see/retry.
			await goto(`/inbox/${conversationId}`, { replaceState: true });
		} finally {
			starting = false;
		}
	}
</script>

<svelte:head>
	<title>{headerName ? `New message — ${headerName}` : 'New message'} — Inbox</title>
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
					{headerName || 'New message'}
				</div>
				{#if headerPhone}
					<div class="truncate text-xs text-muted-foreground">{headerPhone}</div>
				{/if}
			</div>
		</div>
		{#if headerPhone}
			<a
				href={`tel:${headerPhone}`}
				class="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label="Call contact"
			>
				<Phone class="h-5 w-5" />
			</a>
		{/if}
	</header>

	<!-- Body -->
	<div class="flex min-h-0 flex-1 flex-col">
		{#if loading}
			<div class="flex-1 overflow-hidden p-4 md:p-6">
				<div class="mx-auto max-w-3xl rounded-xl border border-border/60 bg-card p-4 shadow-card">
					<SkeletonLoader lines={4} label="Opening conversation" />
				</div>
			</div>
		{:else if loadError}
			<div class="flex-1 p-4 md:p-6">
				<div
					class="mx-auto max-w-3xl rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-5 text-sm text-destructive shadow-card"
				>
					{loadError}
				</div>
			</div>
		{:else}
			<div class="flex flex-1 items-center justify-center p-4">
				<EmptyState
					icon={MessageSquare}
					title="New message"
					description={`Send a message to start the conversation with ${headerName || 'this contact'}.`}
				/>
			</div>

			<!-- Composer -->
			<div
				class="shrink-0 border-t border-border/50 bg-background px-3 pb-3 pt-3 shadow-[0_-10px_30px_-20px_hsl(0_0%_0%/0.18)] sm:px-5"
			>
				<div class="mx-auto max-w-3xl">
					{#if optedOut && availableChannels.length === 1 && availableChannels[0] === 'sms'}
						<div class="mb-2">
							<OptOutBanner />
						</div>
					{/if}
					<Composer
						{availableChannels}
						{suggestedChannel}
						{canSend}
						smsOptOut={optedOut}
						isClosed={false}
						smsQuota={draft?.sms_quota ?? null}
						{quickReplies}
						contactName={headerName}
						orgName={org().name}
						contactId={data.contactId}
						onSend={handleSend}
					/>
				</div>
			</div>
		{/if}
	</div>
</div>
