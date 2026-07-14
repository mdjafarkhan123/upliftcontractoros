<script lang="ts">
	import type { ThreadMessage } from '$lib/stores/inbox.svelte';
	import { inboxStore } from '$lib/stores/inbox.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import MessageMedia from './MessageMedia.svelte';

	let {
		message: m,
		canRetry = false,
		inboundInitials = '',
		outboundInitials = '',
		grouped = false
	}: {
		message: ThreadMessage;
		canRetry?: boolean;
		inboundInitials?: string;
		outboundInitials?: string;
		grouped?: boolean;
	} = $props();

	const isRetryable = $derived(
		m.direction === 'outbound' && !m.is_internal_note && m.status === 'failed' && canRetry
	);
	const isAutomated = $derived(
		m.direction === 'outbound' &&
			!m.is_internal_note &&
			typeof m.source === 'string' &&
			m.source.startsWith('automation.')
	);

	let retrying = $state(false);

	async function onRetry() {
		if (retrying || m._optimistic_key) return;
		retrying = true;
		const res = await inboxStore.retryMessage(m.conversation_id, m.id);
		retrying = false;
		if (!res.ok) toast.error(res.error);
	}

	const isInbound = $derived(m.direction === 'inbound');
	const isPending = $derived(m.status === 'queued' || m.status === 'sending');
	const isDestructive = $derived(
		m.status === 'failed' || m.status === 'bounced' || m.status === 'undeliverable'
	);
	const isTerminalFailure = $derived(m.status === 'bounced' || m.status === 'undeliverable');

	const timestamp = $derived(
		m.created_at
			? new Date(m.created_at).toLocaleTimeString('en-US', {
					hour: 'numeric',
					minute: '2-digit'
				})
			: ''
	);

	const isRead = $derived(isInbound ? false : m.opened_at != null);
	const isDelivered = $derived(isInbound ? false : m.status === 'delivered');

	function stripQuotedReply(raw: string): string {
		if (!raw) return raw;
		const lines = raw.split(/\r?\n/);
		const kept: string[] = [];
		for (let i = 0; i < lines.length; i++) {
			const t = lines[i].trim();
			if (/^On\b.*\bwrote:?$/i.test(t)) break;
			if (/^On\b/i.test(t) && /\bwrote:?$/i.test((lines[i + 1] ?? '').trim())) break;
			if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(t)) break;
			if (t.startsWith('>')) break;
			kept.push(lines[i]);
		}
		const cleaned = kept.join('\n').trim();
		return cleaned || raw.trim();
	}
	const displayBody = $derived(stripQuotedReply(m.body ?? ''));
	const hasBody = $derived(displayBody.length > 0);
</script>

<div class="msg msg--{isInbound ? 'in' : 'out'}" class:msg--grouped={grouped}>
	{#if isInbound}
		{#if !grouped}
			<div class="msg__avatar msg__avatar--in" aria-hidden="true">
				{#if inboundInitials}
					{inboundInitials}
				{:else}
					<i class="ri-mail-line" aria-hidden="true"></i>
				{/if}
			</div>
		{:else}
			<div class="msg__spacer"></div>
		{/if}
	{/if}

	<div class="msg__col msg__col--{isInbound ? 'in' : 'out'}">
		<div
			class="msg__bubble msg__bubble--{isInbound ? 'in' : 'out'} msg__bubble--email"
			class:msg__bubble--pending={isPending && !isTerminalFailure}
			class:msg__bubble--failed={!isInbound && isDestructive && !isTerminalFailure}
			class:msg__bubble--terminal={!isInbound && isTerminalFailure}
		>
			{#if m.email_subject}
				<p class="msg__subject">{m.email_subject}</p>
			{/if}

			{#if hasBody}
				<p class="msg__text">{displayBody}</p>
			{/if}

			{#if m.media && m.media.length > 0}
				<div class="msg__media msg__media--email">
					<MessageMedia media={m.media} align="start" />
				</div>
			{/if}

			<div class="msg__foot" class:msg__foot--tight={!hasBody && m.media && m.media.length > 0}>
				<span class="msg__chan">
					<i class="ri-mail-line" aria-hidden="true"></i>
					<span class="msg__chan-label">Email</span>
				</span>
				{#if isAutomated}
					<i class="ri-sparkling-line msg__auto" aria-label="Automated"></i>
				{/if}
				<span class="msg__time">{timestamp}</span>
				{#if !isInbound}
					{#if isPending}
						<i
							class="ri-loader-4-line animate-spin msg__status msg__status--pending"
							aria-label="Sending"
						></i>
					{:else if isDestructive}
						{#if isTerminalFailure}
							<i class="ri-forbid-line msg__status msg__status--failed" aria-label={m.status}></i>
						{:else}
							<i class="ri-error-warning-line msg__status msg__status--failed" aria-label="Failed"
							></i>
						{/if}
					{:else if isRead}
						<i class="ri-eye-line msg__status msg__status--read" aria-label="Opened"></i>
					{:else if isDelivered}
						<i
							class="ri-check-double-line msg__status msg__status--delivered"
							aria-label="Delivered"
						></i>
					{:else}
						<i class="ri-check-line msg__status msg__status--sent" aria-label="Sent"></i>
					{/if}
				{/if}
			</div>

			{#if !isInbound && isDestructive}
				<div class="msg__fail msg__fail--email">
					{#if m.failure_reason}
						<span class="msg__fail-reason">{m.failure_reason}</span>
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
			{/if}
		</div>
	</div>

	{#if !isInbound}
		{#if !grouped}
			<div class="msg__avatar msg__avatar--out" aria-hidden="true">
				{#if outboundInitials}
					{outboundInitials}
				{:else}
					<i class="ri-mail-line" aria-hidden="true"></i>
				{/if}
			</div>
		{:else}
			<div class="msg__spacer"></div>
		{/if}
	{/if}
</div>
