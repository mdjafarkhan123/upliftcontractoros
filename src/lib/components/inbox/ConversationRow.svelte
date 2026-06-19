<script lang="ts">
	import {
		MessageSquare,
		PhoneMissed,
		Phone,
		Mail,
		MessageCircle,
		Clock,
		Lock,
		AlertCircle,
		AlertTriangle
	} from '@lucide/svelte';
	import type { ConversationListItem, MessageChannel } from '$lib/stores/inbox.svelte';
	import { cn } from '$lib/utils/cn';
	import ConversationRowBody from './ConversationRowBody.svelte';

	let {
		conversation: c,
		dense = false,
		selected = false,
		onSelect
	}: {
		conversation: ConversationListItem;
		dense?: boolean;
		selected?: boolean;
		onSelect?: (id: string) => void;
	} = $props();

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

	const meta = $derived.by(() => {
		const parts: string[] = [];
		if (isWaiting) parts.push(waitingLabel === 'now' ? 'Waiting' : `Waiting ${waitingLabel}`);
		if (hasFailure) parts.push('Delivery failed');
		if (isSnoozed) parts.push(formatSnoozeUntil(c.snoozed_until));
		else if (isClosed) parts.push('Closed');
		if (c.assignee_name) parts.push(c.assignee_name);
		return parts;
	});

	const showMeta = $derived(meta.length > 0);

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

	function metaColorFn(): string {
		if (hasFailure) return 'text-destructive';
		if (isWaiting) return 'text-amber-600 dark:text-amber-400';
		return 'text-muted-foreground';
	}

	const metaColor = $derived(metaColorFn());
</script>

{#if onSelect}
	<button
		type="button"
		onclick={() => onSelect?.(c.id)}
		aria-current={selected ? 'true' : undefined}
		class={cn(
			'group relative flex items-center gap-3 text-left transition-colors duration-150',
			dense
				? 'min-h-[60px] px-3 py-2 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40'
				: 'min-h-[72px] overflow-hidden rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-card hover:border-border hover:bg-muted/30 active:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
			selected && 'bg-primary/[0.05]'
		)}
	>
		{#if hasUnread && !isClosed}
			<span
				class={cn(
					'absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-primary/80',
					selected && 'bg-primary'
				)}
			></span>
		{:else if selected}
			<span class="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-primary"></span>
		{/if}
		<ConversationRowBody
			{c}
			{dense}
			{initials}
			{ChannelIcon}
			{channelTint}
			{timeLabel}
			{hasUnread}
			{isSnoozed}
			{isClosed}
			{isWaiting}
			{hasFailure}
			{previewText}
			{meta}
			{showMeta}
			{metaColor}
		/>
	</button>
{:else}
	<a
		href={`/inbox/${c.id}`}
		aria-current={selected ? 'true' : undefined}
		class={cn(
			'group relative flex items-start gap-3 transition-colors duration-150 ease-out',
			dense
				? 'min-h-[60px] px-3 py-2 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40'
				: 'min-h-[72px] overflow-hidden rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-card hover:border-border hover:bg-muted/30 active:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
			hasUnread && !isClosed && !dense && 'border-primary/25 bg-primary/[0.025]',
			hasFailure && !dense && 'border-destructive/40 bg-destructive/[0.035]',
			isClosed && !dense && 'opacity-60'
		)}
	>
		{#if hasUnread && !isClosed}
			<span class="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-primary/80"></span>
		{/if}
		<ConversationRowBody
			{c}
			{dense}
			{initials}
			{ChannelIcon}
			{channelTint}
			{timeLabel}
			{hasUnread}
			{isSnoozed}
			{isClosed}
			{isWaiting}
			{hasFailure}
			{previewText}
			{meta}
			{showMeta}
			{metaColor}
		/>
	</a>
{/if}
