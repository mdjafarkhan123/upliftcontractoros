<script lang="ts">
	import {
		Mail,
		AlertCircle,
		Loader2,
		Check,
		CheckCheck,
		Eye,
		Ban,
		RotateCcw,
		Sparkles
	} from '@lucide/svelte';
	import type { ThreadMessage } from '$lib/stores/inbox.svelte';
	import { inboxStore } from '$lib/stores/inbox.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import MessageMedia from './MessageMedia.svelte';
	import { cn } from '$lib/utils/cn';

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
				{:else}
					<Mail class="h-3.5 w-3.5" />
				{/if}
			</div>
		{:else}
			<div class="w-8 shrink-0"></div>
		{/if}
	{/if}

	<div
		class={cn(
			'flex max-w-[82%] flex-col md:max-w-[74%]',
			isInbound ? 'items-start' : 'items-end'
		)}
	>
		<div
			class={cn(
				'rounded-2xl px-4 py-3.5 text-sm shadow-sm transition-colors',
				isInbound
					? 'bg-secondary text-foreground'
					: cn(
							'bg-primary/90 text-primary-foreground',
							isDestructive && 'ring-1 ring-inset ring-destructive/40',
							isTerminalFailure && 'bg-destructive/10 text-foreground ring-2 ring-inset ring-destructive/50'
						),
				isPending && !isTerminalFailure && 'opacity-75'
			)}
		>
			{#if m.email_subject}
				<p
					class={cn(
						'mb-1.5 truncate text-[13px] font-semibold leading-snug',
						isInbound ? 'text-foreground' : 'text-primary-foreground/90'
					)}
				>
					{m.email_subject}
				</p>
			{/if}

			{#if hasBody}
				<p class="whitespace-pre-wrap break-words leading-relaxed">{displayBody}</p>
			{/if}

			{#if m.media && m.media.length > 0}
				<div class="mt-3">
					<MessageMedia media={m.media} align="start" />
				</div>
			{/if}

			<div
				class={cn(
					'mt-2 flex items-center justify-end gap-1.5',
					hasBody === false && m.media && m.media.length > 0 && '-mt-1'
				)}
			>
				<span class="inline-flex items-center gap-1 text-[10px]">
					<Mail class="h-3.5 w-3.5 text-amber-500" />
					<span class={isInbound ? 'text-muted-foreground/70' : 'text-primary-foreground/50'}>Email</span>
				</span>
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
				{#if !isInbound}
					{#if isPending}
						<Loader2 class="h-3 w-3 animate-spin text-primary-foreground/70" aria-label="Sending" />
					{:else if isDestructive}
						{#if isTerminalFailure}
							<Ban class="h-3 w-3 text-destructive/70" aria-label={m.status} />
						{:else}
							<AlertCircle class="h-3 w-3 text-destructive/70" aria-label="Failed" />
						{/if}
					{:else if isRead}
						<Eye class="h-3.5 w-3.5 text-sky-500" aria-label="Opened" />
					{:else if isDelivered}
						<CheckCheck class="h-3.5 w-3.5 text-primary-foreground/80" aria-label="Delivered" />
					{:else}
						<Check class="h-3.5 w-3.5 text-primary-foreground/50" aria-label="Sent" />
					{/if}
				{/if}
			</div>

			{#if !isInbound && isDestructive}
				<div class="mt-2 flex items-center justify-end gap-2 border-t border-destructive/15 pt-2">
					{#if m.failure_reason}
						<span class="max-w-[260px] truncate text-[10px] text-destructive/80"
							>{m.failure_reason}</span
						>
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
						<Mail class="h-3.5 w-3.5" />
					{/if}
				</div>
			{:else}
				<div class="w-8 shrink-0"></div>
			{/if}
		{/if}
	</div>
</div>
