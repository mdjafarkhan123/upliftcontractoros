<script lang="ts">
	import { MessageSquare, PhoneMissed, Mail, MessageCircle } from '@lucide/svelte';
	import type { ConversationListItem } from '$lib/stores/inbox.svelte';
	import { cn } from '$lib/utils/cn';

	let { conversation: c }: { conversation: ConversationListItem } = $props();

	const ChannelIcon = $derived(
		c.channel === 'missed_call'
			? PhoneMissed
			: c.channel === 'email'
				? Mail
				: c.channel === 'webchat'
					? MessageCircle
					: MessageSquare
	);

	const channelTint = $derived(
		c.channel === 'missed_call' ? 'text-amber-500' : 'text-primary'
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

	const previewText = $derived.by(() => {
		if (c.channel === 'missed_call' && !c.last_message_body) return 'Missed call';
		if (!c.last_message_body) return 'No messages yet';
		const prefix = c.last_message_direction === 'outbound' ? 'You: ' : '';
		return prefix + c.last_message_body;
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
</script>

<a
	href={`/inbox/${c.id}`}
	class={cn(
		'flex min-h-[72px] items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-3 transition-all duration-150 ease-out',
		'hover:border-border hover:bg-accent/40 active:bg-accent/60',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
		hasUnread && 'border-primary/30 bg-card'
	)}
>
	<div class="relative">
		<div
			class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
		>
			{initials}
		</div>
		<div
			class={cn(
				'absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-background',
				channelTint
			)}
		>
			<ChannelIcon class="h-3 w-3" />
		</div>
	</div>

	<div class="min-w-0 flex-1">
		<div class="flex items-baseline justify-between gap-2">
			<p class={cn('truncate text-sm font-semibold text-foreground', hasUnread && 'font-bold')}>
				{c.contact_name}
			</p>
			<span class="shrink-0 text-xs text-muted-foreground">{timeLabel}</span>
		</div>

		<div class="mt-0.5 flex items-center justify-between gap-2">
			<p
				class={cn(
					'truncate text-sm text-muted-foreground',
					hasUnread && 'text-foreground'
				)}
			>
				{previewText}
			</p>
			{#if hasUnread}
				<span
					class="ml-2 inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground"
				>
					{c.unread_count > 99 ? '99+' : c.unread_count}
				</span>
			{/if}
		</div>
	</div>
</a>
