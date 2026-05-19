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
		Ban
	} from '@lucide/svelte';
	import type { ThreadMessage } from '$lib/stores/inbox.svelte';
	import { cn } from '$lib/utils/cn';

	let { message: m }: { message: ThreadMessage } = $props();

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
</script>

<div class="px-1">
	<div
		class={cn(
			'rounded-xl border bg-card shadow-sm transition-colors',
			isInbound
				? 'border-l-4 border-l-blue-500/60 border-border'
				: 'border-l-4 border-l-primary/70 border-border',
			isPending && 'opacity-70',
			isDestructive && 'border-destructive/40'
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
					<span
						class="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
					>
						{isInbound ? 'Inbound email' : 'Sent email'}
					</span>
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
				{#if isDestructive && m.failure_reason}
					<div class="mt-1 text-right text-[10px] text-destructive/80">
						{m.failure_reason}
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
