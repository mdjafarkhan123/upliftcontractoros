<script lang="ts">
	import {
		PhoneMissed,
		PhoneOutgoing,
		PhoneOff,
		Voicemail,
		CalendarPlus,
		Check,
		CheckCheck,
		AlertCircle,
		Ban,
		Loader2,
		Clock,
		StickyNote,
		MessageSquare,
		Globe,
		RotateCcw,
		Sparkles
	} from '@lucide/svelte';
	import type { ThreadMessage } from '$lib/stores/inbox.svelte';
	import { inboxStore } from '$lib/stores/inbox.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import EmailMessageCard from './EmailMessageCard.svelte';
	import MessageMedia from './MessageMedia.svelte';
	import { cn } from '$lib/utils/cn';

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
				return { label: 'Spoke', icon: PhoneOutgoing };
			case 'voicemail':
				return { label: 'Left voicemail', icon: Voicemail };
			case 'no_answer':
				return { label: 'No answer', icon: PhoneOff };
			case 'follow_up_scheduled':
				return { label: 'Follow-up scheduled', icon: CalendarPlus };
			case 'wrong_number':
				return { label: 'Wrong number', icon: Ban };
			default:
				return { label: 'Logged call', icon: PhoneOutgoing };
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
	<div class="flex justify-center py-0.5">
		<div
			class="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/8 px-3 py-1 text-[11px] font-medium text-amber-700 shadow-sm dark:text-amber-400"
		>
			<PhoneMissed class="h-3.5 w-3.5" />
			<span>Missed call · {timestamp}</span>
		</div>
	</div>
{:else if isCall}
	<div class="flex justify-center px-2 py-1">
		<div
			class="w-full max-w-[85%] rounded-xl border border-border/60 bg-card px-3.5 py-2.5 text-sm shadow-sm"
		>
			<div class="flex items-center gap-2 text-foreground">
				<callMeta.icon class="h-4 w-4 shrink-0 text-primary" />
				<span class="font-medium">{callMeta.label}</span>
				{#if callDuration}
					<span class="text-muted-foreground">· {callDuration}</span>
				{/if}
				<span class="ml-auto text-[11px] text-muted-foreground">{timestamp}</span>
			</div>
			{#if hasBody}
				<p class="mt-1.5 whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
					{m.body}
				</p>
			{/if}
			{#if m.call_outcome === 'follow_up_scheduled'}
				<a
					href={followUpHref}
					class="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
				>
					<CalendarPlus class="h-3.5 w-3.5" />
					Schedule appointment
				</a>
			{/if}
		</div>
	</div>
{:else if isInternal}
	<div class="flex justify-center px-2 py-0.5">
		<div
			class="max-w-[85%] rounded-xl border border-amber-500/15 bg-amber-500/6 px-3.5 py-2.5 text-sm text-foreground shadow-sm"
		>
			<div
				class="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
			>
				<StickyNote class="h-3 w-3" />
				Internal note
			</div>
			<p class="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
			<div class="mt-1 text-right text-[10px] text-muted-foreground">{timestamp}</div>
		</div>
	</div>
{:else}
	<div
		class={cn(
			'flex items-end gap-2',
			isInbound ? 'justify-start' : 'justify-end',
			grouped ? 'mt-0.5' : 'mt-4'
		)}
	>
		{#if isInbound}
			{#if !grouped}
				<div
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground ring-1 ring-border/60"
					aria-hidden="true"
				>
					{#if inboundInitials}
						{inboundInitials}
					{:else if m.channel === 'webchat'}
						<Globe class="h-3.5 w-3.5" />
					{:else}
						<MessageSquare class="h-3.5 w-3.5" />
					{/if}
				</div>
			{:else}
				<div class="w-8 shrink-0"></div>
			{/if}
		{/if}

		<div
			class={cn(
				'flex max-w-[78%] flex-col md:max-w-[70%]',
				isInbound ? 'items-start' : 'items-end'
			)}
		>
			<div
				class={cn(
					'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm transition-colors',
					isInbound
						? 'bg-secondary text-foreground'
						: cn(
								'bg-primary/90 text-primary-foreground',
								isDestructive && 'ring-1 ring-inset ring-destructive/40',
								isTerminalFailure &&
									'bg-destructive/10 text-foreground ring-2 ring-inset ring-destructive/50'
							),
					isPending && !isTerminalFailure && 'opacity-75'
				)}
			>
				{#if hasMedia}
					<MessageMedia media={mediaItems} align={isInbound ? 'start' : 'end'} />
				{/if}
				{#if hasBody}
					<p class="whitespace-pre-wrap break-words">{m.body}</p>
				{/if}

				<div
					class={cn('mt-1 flex items-center justify-end gap-1', hasMedia && !hasBody && '-mt-1')}
				>
					{#if !isInternal && !isMissedCall}
						<span class="inline-flex items-center gap-1 text-[10px]">
							{#if m.channel === 'webchat'}
								<Globe class="h-3.5 w-3.5 text-violet-500" />
								<span class={isInbound ? 'text-muted-foreground/70' : 'text-primary-foreground/50'}
									>Chat</span
								>
							{:else}
								<MessageSquare class="h-3.5 w-3.5 text-sky-500" />
								<span class={isInbound ? 'text-muted-foreground/70' : 'text-primary-foreground/50'}
									>SMS</span
								>
							{/if}
						</span>
					{/if}
					{#if isAutomated}
						<Sparkles class="h-3 w-3 shrink-0 opacity-60" aria-label="Automated" />
					{/if}
					<span
						class={cn(
							'text-[11px]',
							isInbound ? 'text-muted-foreground' : 'text-primary-foreground/60'
						)}
					>
						{timestamp}
					</span>
					{#if isOutbound}
						{#if isSending && !isStalled}
							<Loader2 class="h-3 w-3 animate-spin opacity-60" aria-label="Sending" />
						{:else if isStalled}
							<Clock class="h-3 w-3 text-amber-400" aria-label="Delayed" />
						{:else if isDestructive}
							{#if isTerminalFailure}
								<Ban class="h-3 w-3 text-destructive/70" aria-label={statusDisplay?.label ?? ''} />
							{:else}
								<AlertCircle class="h-3 w-3 text-destructive/70" aria-label="Failed" />
							{/if}
						{:else if isRead && isDelivered}
							<CheckCheck class="h-3.5 w-3.5 text-sky-500" aria-label="Read" />
						{:else if isDelivered}
							<CheckCheck class="h-3.5 w-3.5 text-primary-foreground/80" aria-label="Delivered" />
						{:else if isSent}
							<Check class="h-3.5 w-3.5 text-primary-foreground/50" aria-label="Sent" />
						{/if}
					{/if}
				</div>
			</div>

			{#if isOutbound && isDestructive}
				<div class="mt-1 flex flex-wrap items-center gap-2">
					{#if statusDisplay}
						<span
							class={cn(
								'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
								statusDisplay.tone === 'destructive'
									? 'bg-red-50 text-red-700 ring-red-200/70 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20'
									: 'bg-muted text-muted-foreground ring-border/60'
							)}
						>
							{statusDisplay.label}
						</span>
					{/if}
					{#if isRetryable}
						<button
							type="button"
							onclick={onRetry}
							disabled={retrying}
							class="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-destructive/40 px-2 py-0.5 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30 disabled:opacity-60"
						>
							{#if retrying}
								<Loader2 class="h-3 w-3 animate-spin" />
								<span>Retrying…</span>
							{:else}
								<RotateCcw class="h-3 w-3" />
								<span>Retry</span>
							{/if}
						</button>
					{/if}
				</div>
				{#if m.failure_reason || isTerminalFailure}
					<p class="mt-0.5 max-w-[260px] truncate text-[10px] text-destructive/80">
						{m.failure_reason ?? 'No retry available'}
					</p>
				{/if}
			{/if}
		</div>

		{#if !isInbound}
			{#if !grouped}
				<div
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary ring-1 ring-primary/20"
					aria-hidden="true"
				>
					{#if outboundInitials}
						{outboundInitials}
					{:else}
						<MessageSquare class="h-3.5 w-3.5" />
					{/if}
				</div>
			{:else}
				<div class="w-8 shrink-0"></div>
			{/if}
		{/if}
	</div>
{/if}
