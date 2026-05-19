<script lang="ts">
	import {
		PhoneMissed,
		Check,
		AlertCircle,
		Ban,
		Loader2,
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
	import { cn } from '$lib/utils/cn';

	let { message: m, canRetry = false }: { message: ThreadMessage; canRetry?: boolean } = $props();

	const isMissedCall = $derived(m.channel === 'missed_call');
	const isEmail = $derived(m.channel === 'email');
	const isInbound = $derived(m.direction === 'inbound');
	const isInternal = $derived(m.is_internal_note);

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

	async function onRetry() {
		if (retrying || m._optimistic_key) return;
		retrying = true;
		const res = await inboxStore.retryMessage(m.conversation_id, m.id);
		retrying = false;
		if (!res.ok) toast.error(res.error);
	}
</script>

{#if isEmail}
	<EmailMessageCard message={m} {canRetry} />
{:else if isMissedCall}
	<div class="flex justify-center">
		<div
			class="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"
		>
			<PhoneMissed class="h-3.5 w-3.5" />
			<span>Missed call · {timestamp}</span>
		</div>
	</div>
{:else if isInternal}
	<div class="flex justify-center px-2">
		<div
			class="max-w-[85%] rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-foreground"
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
	<div class={cn('flex', isInbound ? 'justify-start' : 'justify-end')}>
		<div class={cn('flex max-w-[80%] flex-col', isInbound ? 'items-start' : 'items-end')}>
			{#if isAutomated}
				<div
					class="mb-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
				>
					<Sparkles class="h-2.5 w-2.5" />
					<span>Automated</span>
				</div>
			{/if}
			<div
				class={cn(
					'rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm transition-colors',
					isInbound
						? 'rounded-bl-md bg-card text-foreground'
						: 'rounded-br-md bg-primary text-primary-foreground',
					(m.status === 'queued' || m.status === 'sending') && 'opacity-70',
					isDestructive && !isTerminalFailure && 'border border-destructive/40',
					isTerminalFailure && 'border-2 border-destructive/70 bg-destructive/5'
				)}
			>
				<p class="whitespace-pre-wrap break-words">{m.body}</p>
				<div
					class={cn(
						'mt-1 flex items-center justify-end gap-1 text-[10px]',
						isInbound ? 'text-muted-foreground' : 'text-primary-foreground/70'
					)}
				>
					{#if m.channel === 'webchat'}
						<Globe class="h-3 w-3 opacity-70" aria-label="Webchat" />
					{:else}
						<MessageSquare class="h-3 w-3 opacity-70" aria-label="SMS" />
					{/if}
					<span>{timestamp}</span>
					{#if !isInbound}
						{#if m.status === 'queued' || m.status === 'sending'}
							<Loader2 class="h-3 w-3 animate-spin" aria-label="Sending" />
						{:else if m.status === 'delivered'}
							<Check class="h-3 w-3" aria-label="Delivered" />
						{:else if isTerminalFailure}
							<Ban class="h-3 w-3 text-destructive" aria-label={m.status === 'bounced' ? 'Bounced' : 'Undeliverable'} />
						{:else if isDestructive}
							<AlertCircle class="h-3 w-3 text-destructive" aria-label="Failed" />
						{:else}
							<Check class="h-3 w-3" aria-label="Sent" />
						{/if}
					{/if}
				</div>
			</div>

			{#if !isInbound && isDestructive}
				<div class="mt-1 flex items-center gap-2 text-[10px] text-destructive">
					<span class="font-medium uppercase tracking-wide">
						{m.status === 'bounced' ? 'Bounced' : m.status === 'undeliverable' ? 'Undeliverable' : 'Failed'}
					</span>
					<span class="max-w-[220px] truncate opacity-80">
						{m.failure_reason ?? (isTerminalFailure ? 'No retry available' : 'Failed to send')}
					</span>
					{#if isRetryable}
						<button
							type="button"
							onclick={onRetry}
							disabled={retrying}
							class="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-1.5 py-0.5 font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60 min-h-[28px]"
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
	</div>
{/if}
