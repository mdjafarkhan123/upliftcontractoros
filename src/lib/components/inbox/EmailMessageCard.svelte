<script lang="ts">
	import {
		Mail,
		AlertCircle,
		Loader2,
		Check,
		CheckCheck,
		Eye,
		Send,
		Clock,
		Ban,
		RotateCcw,
		Sparkles
	} from '@lucide/svelte';
	import type { ThreadMessage } from '$lib/stores/inbox.svelte';
	import { inboxStore } from '$lib/stores/inbox.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { cn } from '$lib/utils/cn';

	let { message: m, canRetry = false }: { message: ThreadMessage; canRetry?: boolean } = $props();

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

	const timestamp = $derived(
		m.created_at
			? new Date(m.created_at).toLocaleString('en-US', {
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit'
				})
			: ''
	);

	type Display = {
		label: string;
		icon: typeof Mail;
		tone: 'muted' | 'progress' | 'success' | 'destructive';
		spin?: boolean;
	};

	const display = $derived<Display>(
		(() => {
			if (m.opened_at) return { label: 'Opened', icon: Eye, tone: 'success' };
			switch (m.status) {
				case 'queued':
					return { label: 'Queued', icon: Clock, tone: 'muted' };
				case 'sending':
					return { label: 'Sending…', icon: Loader2, tone: 'progress', spin: true };
				case 'sent':
					return { label: 'Sent', icon: Check, tone: 'muted' };
				case 'delivered':
					return { label: 'Delivered', icon: CheckCheck, tone: 'success' };
				case 'failed':
					return { label: 'Failed', icon: AlertCircle, tone: 'destructive' };
				case 'bounced':
					return { label: 'Bounced', icon: AlertCircle, tone: 'destructive' };
				case 'undeliverable':
					return { label: 'Undeliverable', icon: Ban, tone: 'destructive' };
				default:
					return { label: 'Sent', icon: Send, tone: 'muted' };
			}
		})()
	);

	const toneClass = $derived(
		display.tone === 'destructive'
			? 'text-destructive'
			: display.tone === 'success'
				? 'text-emerald-600 dark:text-emerald-400'
				: display.tone === 'progress'
					? 'text-primary'
					: 'text-muted-foreground'
	);

	const isPending = $derived(m.status === 'queued' || m.status === 'sending');
	const isDestructive = $derived(
		m.status === 'failed' || m.status === 'bounced' || m.status === 'undeliverable'
	);
	const isTerminalFailure = $derived(m.status === 'bounced' || m.status === 'undeliverable');
</script>

<div class="px-1">
	<div
		class={cn(
			'rounded-xl border bg-card shadow-sm transition-colors',
			isInbound
				? 'border-l-4 border-l-blue-500/60 border-border'
				: 'border-l-4 border-l-primary/70 border-border',
			isPending && 'opacity-70',
			isDestructive && !isTerminalFailure && 'border-destructive/40 border-l-destructive/60',
			isTerminalFailure && 'border-destructive/60 border-l-destructive bg-destructive/[0.03]'
		)}
	>
		<div class="flex items-start gap-3 border-b border-border/60 px-4 py-2.5">
			<div
				class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/40 text-muted-foreground"
			>
				<Mail class="h-3.5 w-3.5" />
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-center justify-between gap-2">
					<div class="flex min-w-0 items-center gap-2">
						<span
							class="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
						>
							{isInbound ? 'Inbound email' : 'Sent email'}
						</span>
						{#if isAutomated}
							<span
								class="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
							>
								<Sparkles class="h-2.5 w-2.5" />
								Automated
							</span>
						{/if}
					</div>
					<span class="shrink-0 text-[11px] text-muted-foreground">{timestamp}</span>
				</div>
				{#if m.email_subject}
					<div class="mt-0.5 truncate text-sm font-semibold text-foreground">
						{m.email_subject}
					</div>
				{/if}
				{#if m.email_from_address && isInbound}
					<div class="truncate text-[11px] text-muted-foreground">From: {m.email_from_address}</div>
				{/if}
			</div>
		</div>
		<div class="px-4 py-3">
			<p class="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
				{m.body}
			</p>
			{#if !isInbound}
				<div class={cn('mt-2 flex items-center justify-end gap-1 text-[10px]', toneClass)}>
					<display.icon class={cn('h-3 w-3', display.spin && 'animate-spin')} />
					<span>{display.label}</span>
				</div>
				{#if isDestructive}
					<div class="mt-1 flex items-center justify-end gap-2 text-[10px] text-destructive/80">
						{#if m.failure_reason}
							<span class="max-w-[260px] truncate">{m.failure_reason}</span>
						{/if}
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
			{/if}
		</div>
	</div>
</div>
