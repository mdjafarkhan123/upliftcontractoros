<script lang="ts">
	import type { ThreadMessage } from '$lib/stores/inbox.svelte';
	import { inboxStore } from '$lib/stores/inbox.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import EmailMessageCard from './EmailMessageCard.svelte';
	import MessageMedia from './MessageMedia.svelte';

	let {
		message: m,
		canRetry = false,
		inboundInitials = '',
		outboundInitials = '',
		grouped = false,
		contactId = '',
		contactName = ''
	}: {
		message: ThreadMessage;
		canRetry?: boolean;
		inboundInitials?: string;
		outboundInitials?: string;
		grouped?: boolean;
		contactId?: string;
		contactName?: string;
	} = $props();

	const isMissedCall = $derived(m.channel === 'missed_call');
	const isCall = $derived(m.channel === 'call');

	const callMeta = $derived.by(() => {
		switch (m.call_outcome) {
			case 'spoke':
				return { label: 'Spoke', icon: 'ri-phone-line' };
			case 'voicemail':
				return { label: 'Left voicemail', icon: 'ri-voicemail-line' };
			case 'no_answer':
				return { label: 'No answer', icon: 'ri-phone-off-line' };
			case 'follow_up_scheduled':
				return { label: 'Follow-up scheduled', icon: 'ri-calendar-event-line' };
			case 'wrong_number':
				return { label: 'Wrong number', icon: 'ri-forbid-line' };
			default:
				return { label: 'Logged call', icon: 'ri-phone-line' };
		}
	});

	const callDuration = $derived.by(() => {
		const s = m.call_duration_seconds;
		if (s == null || s <= 0) return null;
		const mins = Math.floor(s / 60);
		const secs = s % 60;
		if (mins > 0) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
		return `${secs}s`;
	});

	const followUpHref = $derived(
		contactId
			? `/appointments/new?contact_id=${contactId}&contact_name=${encodeURIComponent(contactName)}`
			: '/appointments/new'
	);
	const isEmail = $derived(m.channel === 'email');
	const isInbound = $derived(m.direction === 'inbound');
	const isInternal = $derived(m.is_internal_note);
	const mediaItems = $derived(m.media ?? []);
	const hasMedia = $derived(mediaItems.length > 0);
	const hasBody = $derived(!!m.body && m.body.trim().length > 0);

	const timestamp = $derived(
		m.created_at
			? new Date(m.created_at).toLocaleTimeString('en-US', {
					hour: 'numeric',
					minute: '2-digit'
				})
			: ''
	);

	const isRetryable = $derived(!isInbound && !isInternal && m.status === 'failed' && canRetry);
	const isDestructive = $derived(
		m.status === 'failed' || m.status === 'bounced' || m.status === 'undeliverable'
	);
	const isTerminalFailure = $derived(m.status === 'bounced' || m.status === 'undeliverable');
	const isAutomated = $derived(
		!isInbound && !isInternal && typeof m.source === 'string' && m.source.startsWith('automation.')
	);

	let retrying = $state(false);

	const STALL_MS = 20_000;
	const isPending = $derived(m.status === 'queued' || m.status === 'sending');
	let nowTs = $state(Date.now());
	$effect(() => {
		if (!isPending || m._optimistic_key) return;
		const id = setInterval(() => (nowTs = Date.now()), 5000);
		return () => clearInterval(id);
	});
	const isStalled = $derived(
		isPending &&
			!m._optimistic_key &&
			m.created_at != null &&
			nowTs - new Date(m.created_at).getTime() > STALL_MS
	);

	const isOutbound = $derived(!isInbound && !isInternal);
	const isRead = $derived(!isOutbound ? false : m.read_at != null);
	const isDelivered = $derived(!isOutbound ? false : m.status === 'delivered');
	const isSent = $derived(!isOutbound ? false : m.status === 'sent');
	const isSending = $derived(isOutbound ? isPending : false);

	const statusDisplay = $derived<{
		label: string;
		tone: 'progress' | 'success' | 'destructive' | 'muted';
	} | null>(
		!isOutbound
			? null
			: isStalled
				? { label: 'Delayed', tone: 'progress' }
				: isSending
					? { label: 'Sending…', tone: 'progress' }
					: isRead && isDelivered
						? { label: 'Read', tone: 'success' }
						: isDelivered
							? { label: 'Delivered', tone: 'success' }
							: isDestructive
								? {
										label:
											m.status === 'bounced'
												? 'Bounced'
												: m.status === 'undeliverable'
													? 'Undeliverable'
													: 'Failed',
										tone: 'destructive'
									}
								: { label: 'Sent', tone: 'muted' }
	);

	async function onRetry() {
		if (retrying || m._optimistic_key) return;
		retrying = true;
		const res = await inboxStore.retryMessage(m.conversation_id, m.id);
		retrying = false;
		if (!res.ok) toast.error(res.error);
	}
</script>

{#if isEmail}
	<EmailMessageCard message={m} {canRetry} {inboundInitials} {outboundInitials} {grouped} />
{:else if isMissedCall}
	<div class="msg-event">
		<div class="msg-event__chip">
			<i class="ri-phone-off-line" aria-hidden="true"></i>
			<span>Missed call · {timestamp}</span>
		</div>
	</div>
{:else if isCall}
	<div class="msg-call">
		<div class="msg-call__card">
			<div class="msg-call__head">
				<i class="{callMeta.icon} msg-call__icon" aria-hidden="true"></i>
				<span class="msg-call__label">{callMeta.label}</span>
				{#if callDuration}
					<span class="msg-call__dur">· {callDuration}</span>
				{/if}
				<span class="msg-call__time">{timestamp}</span>
			</div>
			{#if hasBody}
				<p class="msg-call__body">{m.body}</p>
			{/if}
			{#if m.call_outcome === 'follow_up_scheduled'}
				<a href={followUpHref} class="msg-call__cta">
					<i class="ri-calendar-event-line" aria-hidden="true"></i>
					Schedule appointment
				</a>
			{/if}
		</div>
	</div>
{:else if isInternal}
	<div class="msg-note">
		<div class="msg-note__card">
			<div class="msg-note__head">
				<i class="ri-sticky-note-line" aria-hidden="true"></i>
				Internal note
			</div>
			<p class="msg-note__body">{m.body}</p>
			<div class="msg-note__time">{timestamp}</div>
		</div>
	</div>
{:else}
	<div class="msg msg--{isInbound ? 'in' : 'out'}" class:msg--grouped={grouped}>
		{#if isInbound}
			{#if !grouped}
				<div class="msg__avatar msg__avatar--in" aria-hidden="true">
					{#if inboundInitials}
						{inboundInitials}
					{:else if m.channel === 'webchat'}
						<i class="ri-global-line" aria-hidden="true"></i>
					{:else}
						<i class="ri-chat-1-line" aria-hidden="true"></i>
					{/if}
				</div>
			{:else}
				<div class="msg__spacer"></div>
			{/if}
		{/if}

		<div class="msg__col msg__col--{isInbound ? 'in' : 'out'}">
			<div
				class="msg__bubble msg__bubble--{isInbound ? 'in' : 'out'}"
				class:msg__bubble--pending={isPending && !isTerminalFailure}
				class:msg__bubble--failed={!isInbound && isDestructive && !isTerminalFailure}
				class:msg__bubble--terminal={!isInbound && isTerminalFailure}
			>
				{#if hasMedia}
					<div class="msg__media">
						<MessageMedia media={mediaItems} align={isInbound ? 'start' : 'end'} />
					</div>
				{/if}
				{#if hasBody}
					<p class="msg__text">{m.body}</p>
				{/if}

				<div class="msg__foot" class:msg__foot--tight={hasMedia && !hasBody}>
					{#if !isInternal && !isMissedCall}
						<span class="msg__chan">
							{#if m.channel === 'webchat'}
								<i class="ri-global-line" aria-hidden="true"></i>
								<span class="msg__chan-label">Chat</span>
							{:else}
								<i class="ri-chat-1-line" aria-hidden="true"></i>
								<span class="msg__chan-label">SMS</span>
							{/if}
						</span>
					{/if}
					{#if isAutomated}
						<i class="ri-sparkling-line msg__auto" aria-label="Automated"></i>
					{/if}
					<span class="msg__time">{timestamp}</span>
					{#if isOutbound}
						{#if isSending && !isStalled}
							<i
								class="ri-loader-4-line animate-spin msg__status msg__status--pending"
								aria-label="Sending"
							></i>
						{:else if isStalled}
							<i class="ri-time-line msg__status msg__status--delayed" aria-label="Delayed"></i>
						{:else if isDestructive}
							{#if isTerminalFailure}
								<i
									class="ri-forbid-line msg__status msg__status--failed"
									aria-label={statusDisplay?.label ?? ''}
								></i>
							{:else}
								<i class="ri-error-warning-line msg__status msg__status--failed" aria-label="Failed"
								></i>
							{/if}
						{:else if isRead && isDelivered}
							<i class="ri-check-double-line msg__status msg__status--read" aria-label="Read"></i>
						{:else if isDelivered}
							<i
								class="ri-check-double-line msg__status msg__status--delivered"
								aria-label="Delivered"
							></i>
						{:else if isSent}
							<i class="ri-check-line msg__status msg__status--sent" aria-label="Sent"></i>
						{/if}
					{/if}
				</div>
			</div>

			{#if isOutbound && isDestructive}
				<div class="msg__fail">
					{#if statusDisplay}
						<span
							class="msg__fail-badge"
							class:msg__fail-badge--muted={statusDisplay.tone !== 'destructive'}
						>
							{statusDisplay.label}
						</span>
					{/if}
					{#if isRetryable}
						<button type="button" onclick={onRetry} disabled={retrying} class="msg__retry">
							{#if retrying}
								<i class="ri-loader-4-line animate-spin" aria-hidden="true"></i>
								<span>Retrying…</span>
							{:else}
								<i class="ri-refresh-line" aria-hidden="true"></i>
								<span>Retry</span>
							{/if}
						</button>
					{/if}
				</div>
				{#if m.failure_reason || isTerminalFailure}
					<p class="msg__fail-reason">{m.failure_reason ?? 'No retry available'}</p>
				{/if}
			{/if}
		</div>

		{#if !isInbound}
			{#if !grouped}
				<div class="msg__avatar msg__avatar--out" aria-hidden="true">
					{#if outboundInitials}
						{outboundInitials}
					{:else}
						<i class="ri-chat-1-line" aria-hidden="true"></i>
					{/if}
				</div>
			{:else}
				<div class="msg__spacer"></div>
			{/if}
		{/if}
	</div>
{/if}
