<script lang="ts">
	import {
		MessageSquare,
		PhoneMissed,
		Phone,
		Mail,
		MessageCircle,
		Clock,
		Lock,
		StickyNote,
		AlertCircle,
		AlertTriangle
	} from '@lucide/svelte';
	import type { ConversationListItem, MessageChannel } from '$lib/stores/inbox.svelte';
	import { cn } from '$lib/utils/cn';

	let { conversation: c }: { conversation: ConversationListItem } = $props();

	const channel: MessageChannel | null = $derived(c.last_message_channel);

	const ChannelIcon = $derived(
		channel === 'missed_call'
			? PhoneMissed
			: channel === 'call'
				? Phone
				: channel === 'email'
					? Mail
					: channel === 'webchat'
						? MessageCircle
						: MessageSquare
	);

	const channelTint = $derived(
		channel === 'missed_call'
			? 'text-amber-600'
			: channel === 'call'
				? 'text-sky-600'
				: channel === 'webchat'
					? 'text-emerald-600'
					: channel === 'email'
						? 'text-indigo-500'
						: 'text-primary'
	);

	const initials = $derived(
		(c.contact_name || '?')
			.split(/\s+/)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.slice(0, 2)
			.join('') || '?'
	);

	const timeLabel = $derived(formatRelative(c.last_message_at));
	const hasUnread = $derived(c.unread_count > 0);
	const isSnoozed = $derived(c.status === 'snoozed');
	const isClosed = $derived(c.status === 'closed');
	const hasFailure = $derived(c.has_delivery_failure === true && !isClosed);
	// Customer's last message is unanswered — they're waiting on us. Hidden when
	// snoozed (deferred on purpose) or closed.
	const isWaiting = $derived(c.last_message_direction === 'inbound' && !isSnoozed && !isClosed);
	const waitingLabel = $derived(isWaiting ? formatWaiting(c.last_inbound_at) : '');

	const previewText = $derived.by(() => {
		if (c.last_message_preview && c.last_message_preview.trim().length > 0) {
			if (c.last_message_direction === 'outbound' && channel !== 'missed_call') {
				return `You: ${c.last_message_preview}`;
			}
			return c.last_message_preview;
		}
		if (channel === 'missed_call') return 'Missed phone call';
		return 'No messages yet';
	});

	function formatRelative(iso: string | null): string {
		if (!iso) return '';
		const then = new Date(iso).getTime();
		const now = Date.now();
		const diff = Math.max(0, now - then);
		const min = 60_000;
		const hr = 60 * min;
		const day = 24 * hr;
		if (diff < min) return 'now';
		if (diff < hr) return `${Math.floor(diff / min)}m`;
		if (diff < day) return `${Math.floor(diff / hr)}h`;
		if (diff < 7 * day) return `${Math.floor(diff / day)}d`;
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function formatWaiting(iso: string | null): string {
		if (!iso) return '';
		const diff = Math.max(0, Date.now() - new Date(iso).getTime());
		const min = 60_000;
		const hr = 60 * min;
		const day = 24 * hr;
		if (diff < min) return 'now';
		if (diff < hr) return `${Math.floor(diff / min)}m`;
		if (diff < day) return `${Math.floor(diff / hr)}h`;
		return `${Math.floor(diff / day)}d`;
	}

	function formatSnoozeUntil(iso: string | null): string {
		if (!iso) return '';
		const date = new Date(iso);
		const now = new Date();
		const sameDay = date.toDateString() === now.toDateString();
		if (sameDay) {
			return `Until ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
		}
		return `Until ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
	}
</script>

<a
	href={`/inbox/${c.id}`}
	class={cn(
		'group relative flex min-h-[86px] items-start gap-3 overflow-hidden rounded-xl border border-border/60 bg-card px-3.5 py-3.5 shadow-card transition-colors duration-150 ease-out',
		'hover:border-border hover:bg-muted/30 active:bg-accent/60',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
		hasUnread && !isClosed && 'border-primary/25 bg-primary/[0.025]',
		hasFailure && 'border-destructive/40 bg-destructive/[0.035]',
		isClosed && 'opacity-60'
	)}
>
	{#if hasUnread && !isClosed}
		<span class="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-primary/80"></span>
	{/if}
	<div class="relative">
		<div
			class={cn(
				'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-1 ring-inset transition-colors duration-150',
				hasUnread && !isClosed
					? 'bg-primary text-primary-foreground ring-primary/20'
					: 'bg-primary/10 text-primary ring-primary/20'
			)}
		>
			{initials}
		</div>
		<div
			class={cn(
				'absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-background shadow-sm',
				channelTint
			)}
		>
			<ChannelIcon class="h-3 w-3" />
		</div>
	</div>

	<div class="min-w-0 flex-1">
		<div class="flex items-baseline justify-between gap-2">
			<p
				class={cn(
					'truncate text-sm font-semibold tracking-tight text-foreground',
					hasUnread && !isClosed && 'font-bold'
				)}
			>
				{c.contact_name}
			</p>
			<span
				class={cn(
					'shrink-0 text-xs font-medium',
					hasUnread && !isClosed ? 'text-primary' : 'text-muted-foreground'
				)}
			>
				{timeLabel}
			</span>
		</div>

		<div class="mt-0.5 flex items-center justify-between gap-2">
			<p
				class={cn(
					'truncate text-sm leading-5 text-muted-foreground',
					hasUnread && !isClosed && 'font-medium text-foreground'
				)}
			>
				{previewText}
			</p>
			{#if hasUnread && !isClosed}
				<span
					class="ml-2 inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground shadow-sm"
				>
					{c.unread_count > 99 ? '99+' : c.unread_count}
				</span>
			{/if}
		</div>

		{#if hasFailure || isWaiting || isSnoozed || isClosed || c.assignee_name}
			<div class="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
				{#if isWaiting}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-600 dark:text-amber-400"
					>
						<AlertTriangle class="h-3 w-3" />
						{waitingLabel === 'now' ? 'Waiting' : `Waiting ${waitingLabel}`}
					</span>
				{/if}
				{#if hasFailure}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive"
					>
						<AlertCircle class="h-3 w-3" />
						Delivery failed
					</span>
				{/if}
				{#if isSnoozed}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-600 dark:text-amber-400"
					>
						<Clock class="h-3 w-3" />
						{formatSnoozeUntil(c.snoozed_until)}
					</span>
				{:else if isClosed}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted px-1.5 py-0.5 font-medium text-muted-foreground"
					>
						<Lock class="h-3 w-3" />
						Closed
					</span>
				{/if}
				{#if c.assignee_name}
					<span class="inline-flex items-center gap-1 rounded-full bg-muted/60 px-1.5 py-0.5">
						<StickyNote class="h-3 w-3" />
						{c.assignee_name}
					</span>
				{/if}
			</div>
		{/if}
	</div>
</a>
