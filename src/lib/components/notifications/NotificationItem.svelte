<script lang="ts">
	import {
		Bell,
		Briefcase,
		CalendarCheck,
		CheckCircle2,
		DollarSign,
		Eye,
		MessageSquare,
		PhoneMissed,
		Star,
		ThumbsDown,
		Trophy
	} from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { cn } from '$lib/utils/cn';
	import { notificationStore } from '$lib/stores/notifications.svelte';
	import { getNotificationHref, type NotificationItem } from '$lib/notifications/navigation';
	import type { Component } from 'svelte';

	let {
		notification,
		onNavigate
	}: { notification: NotificationItem; onNavigate?: () => void } = $props();

	const iconByType: Record<string, Component> = {
		'opportunity.won': Trophy,
		'job.created': Briefcase,
		'invoice.paid': DollarSign,
		'quote.viewed': Eye,
		'quote.accepted': CheckCircle2,
		'review.received': Star,
		'private_feedback.received': ThumbsDown,
		'message.received': MessageSquare,
		'call.missed': PhoneMissed,
		appointment_booked: CalendarCheck
	};

	const Icon = $derived<Component>(iconByType[notification.type] ?? Bell);
	const isUnread = $derived(!notification.read_at);

	function formatRelative(iso: string): string {
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

	const timeLabel = $derived(formatRelative(notification.created_at));

	async function handleClick() {
		void notificationStore.markRead(notification.id);
		const href = getNotificationHref(notification);
		onNavigate?.();
		if (href) await goto(href);
	}
</script>

<button
	type="button"
	onclick={handleClick}
	class={cn(
		'flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
		isUnread && 'bg-accent/40'
	)}
>
	<div
		class={cn(
			'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
			isUnread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
		)}
	>
		<Icon class="h-4 w-4" />
	</div>
	<div class="min-w-0 flex-1">
		<div class="flex items-start justify-between gap-2">
			<p class="truncate text-sm font-medium text-foreground">{notification.title}</p>
			<span class="shrink-0 text-xs text-muted-foreground">{timeLabel}</span>
		</div>
		{#if notification.body}
			<p class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{notification.body}</p>
		{/if}
	</div>
	{#if isUnread}
		<span class="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread"></span>
	{/if}
</button>
