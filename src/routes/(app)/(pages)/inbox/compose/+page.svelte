<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
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
			fromLocalPart?: string;
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
				fromLocalPart: opts.fromLocalPart,
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

<div class="compose">
	<!-- Header -->
	<header class="compose__header">
		<button class="compose__icon-btn" onclick={() => goto('/inbox')} aria-label="Back to inbox">
			<i class="ri-arrow-left-line" aria-hidden="true"></i>
		</button>
		<div class="compose__identity">
			<div class="compose__avatar">
				{#if contactInitials}
					{contactInitials}
				{:else}
					<i class="ri-message-2-line" aria-hidden="true"></i>
				{/if}
			</div>
			<div class="compose__identity-text">
				<div class="compose__name">
					{headerName || 'New message'}
				</div>
				{#if headerPhone}
					<div class="compose__phone">{headerPhone}</div>
				{/if}
			</div>
		</div>
		{#if headerPhone}
			<a href={`tel:${headerPhone}`} class="compose__icon-btn" aria-label="Call contact">
				<i class="ri-phone-line" aria-hidden="true"></i>
			</a>
		{/if}
	</header>

	<!-- Body -->
	<div class="compose__body">
		{#if loading}
			<div class="compose__pad">
				<div class="compose__skeleton-card">
					<SkeletonLoader lines={4} label="Opening conversation" />
				</div>
			</div>
		{:else if loadError}
			<div class="compose__pad">
				<div class="compose__error">
					{loadError}
				</div>
			</div>
		{:else}
			<div class="compose__empty">
				<EmptyState
					iconClass="ri-message-2-line"
					title="New message"
					description={`Send a message to start the conversation with ${headerName || 'this contact'}.`}
				/>
			</div>

			<!-- Composer -->
			<div class="compose__composer">
				<div class="compose__composer-inner">
					{#if optedOut && availableChannels.length === 1 && availableChannels[0] === 'sms'}
						<div class="compose__optout">
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

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.compose {
		display: flex;
		flex-direction: column;
		height: calc(100dvh - 72px - var(--bottom-nav-height) - env(safe-area-inset-bottom));
		background-color: var(--color-bg-app);

		@media (min-width: $bp-mobile) {
			height: calc(100dvh - 104px);
		}

		&__header {
			display: flex;
			flex-shrink: 0;
			align-items: center;
			gap: $space-3;
			padding: $space-3;
			background-color: var(--color-bg-surface);
			border-bottom: 1px solid var(--color-border);

			@media (min-width: $bp-mobile) {
				padding: $space-3 $space-5;
			}
		}

		&__icon-btn {
			display: inline-flex;
			flex-shrink: 0;
			align-items: center;
			justify-content: center;
			width: 40px;
			height: 40px;
			border: none;
			border-radius: $radius-full;
			background: none;
			color: var(--color-text-secondary);
			cursor: pointer;
			transition:
				background-color $duration-fast $ease-standard,
				color $duration-fast $ease-standard;

			i {
				font-size: 2rem;
			}
			&:hover {
				background-color: var(--color-bg-surface-sunk);
				color: var(--color-text-primary);
			}
			&:active {
				transform: scale(0.95);
			}
		}

		&__identity {
			display: flex;
			min-width: 0;
			flex: 1 1 auto;
			align-items: center;
			gap: $space-3;
		}

		&__avatar {
			display: flex;
			flex-shrink: 0;
			align-items: center;
			justify-content: center;
			width: 40px;
			height: 40px;
			border-radius: $radius-full;
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-brand);
			background-color: var(--avatar-fallback-bg);

			i {
				font-size: 1.6rem;
			}
		}

		&__identity-text {
			min-width: 0;
			flex: 1 1 auto;
		}

		&__name {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-size: $fs-lg;
			font-weight: $weight-semibold;
			letter-spacing: -0.01em;
			color: var(--color-text-primary);
		}

		&__phone {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-size: $fs-body;
			color: var(--color-text-secondary);
		}

		&__body {
			display: flex;
			min-height: 0;
			flex: 1 1 auto;
			flex-direction: column;
		}

		&__pad {
			flex: 1 1 auto;
			padding: $space-4;

			@media (min-width: $bp-mobile) {
				padding: $space-6;
			}
		}

		&__skeleton-card {
			max-width: 768px;
			margin: 0 auto;
			padding: $space-4;
			border-radius: $radius-xl;
			border: 1px solid var(--color-border);
			background-color: var(--color-bg-surface);
			box-shadow: var(--shadow-card);
		}

		&__error {
			max-width: 768px;
			margin: 0 auto;
			padding: $space-4 $space-4 $space-5;
			border-radius: $radius-xl;
			border: 1px solid var(--danger-solid);
			background-color: var(--danger-bg);
			color: var(--danger-text);
			font-size: $fs-body;
			box-shadow: var(--shadow-card);
		}

		&__empty {
			display: flex;
			flex: 1 1 auto;
			align-items: center;
			justify-content: center;
			padding: $space-4;
		}

		&__composer {
			flex-shrink: 0;
			padding: $space-3;
			background-color: var(--color-bg-surface);
			border-top: 1px solid var(--color-border);
			box-shadow: 0 -10px 30px -20px rgba(13, 21, 15, 0.18);

			@media (min-width: $bp-mobile) {
				padding: $space-3 $space-5;
			}
		}

		&__composer-inner {
			max-width: 768px;
			margin: 0 auto;
		}

		&__optout {
			margin-bottom: $space-2;
		}
	}
</style>
