<script lang="ts">
	import {
		ArrowRight,
		Bell,
		Briefcase,
		CalendarCheck,
		CalendarClock,
		CheckCircle2,
		DollarSign,
		Eye,
		MessageSquare,
		Phone,
		PhoneMissed,
		Reply,
		Star,
		ThumbsDown,
		Trophy,
		Upload
	} from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { cn } from '$lib/utils/cn';
	import { notificationStore } from '$lib/stores/notifications.svelte';
	import { getNotificationHref, type NotificationItem } from '$lib/notifications/navigation';
	import type { Component } from 'svelte';

	let {
		notification,
		onNavigate,
		index = 0
	}: {
		notification: NotificationItem;
		onNavigate?: () => void;
		index?: number;
	} = $props();

	const iconByType: Record<string, Component> = {
		'opportunity.won': Trophy,
		'job.created': Briefcase,
		'invoice.paid': DollarSign,
		'quote.viewed': Eye,
		'quote.accepted': CheckCircle2,
		'quote.changes_requested': MessageSquare,
		'quote.deposit_paid': DollarSign,
		'review.received': Star,
		'private_feedback.received': ThumbsDown,
		'message.received': MessageSquare,
		'call.missed': PhoneMissed,
		appointment_booked: CalendarCheck,
		contact_follow_up_due: CalendarClock,
		opportunity_follow_up_due: CalendarClock,
		opportunity_stale_digest: CalendarClock,
		contact_import_completed: Upload
	};

	type IconColorScheme = 'primary' | 'success' | 'warning' | 'danger' | 'info';

	const iconColorMap: Record<string, IconColorScheme> = {
		'invoice.paid': 'success',
		'quote.deposit_paid': 'success',
		'quote.accepted': 'success',
		'opportunity.won': 'success',
		'call.missed': 'warning',
		'quote.viewed': 'warning',
		'quote.changes_requested': 'warning',
		'private_feedback.received': 'danger',
		'message.received': 'primary',
		'review.received': 'primary',
		'job.created': 'info',
		appointment_booked: 'info',
		contact_follow_up_due: 'info',
		opportunity_follow_up_due: 'info',
		opportunity_stale_digest: 'warning',
		contact_import_completed: 'info'
	};

	const iconColorClasses: Record<
		IconColorScheme,
		{ bg: string; text: string; border: string; cta: string }
	> = {
		primary: {
			bg: 'bg-primary/10',
			text: 'text-primary',
			border: 'border-l-primary',
			cta: 'bg-primary text-primary-foreground hover:bg-primary/90'
		},
		success: {
			bg: 'bg-green-100 dark:bg-green-500/10',
			text: 'text-green-600 dark:text-green-400',
			border: 'border-l-green-500',
			cta: 'bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600'
		},
		warning: {
			bg: 'bg-amber-100 dark:bg-amber-500/10',
			text: 'text-amber-600 dark:text-amber-400',
			border: 'border-l-amber-500',
			cta: 'bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600'
		},
		danger: {
			bg: 'bg-red-100 dark:bg-red-500/10',
			text: 'text-red-600 dark:text-red-400',
			border: 'border-l-red-500',
			cta: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600'
		},
		info: {
			bg: 'bg-blue-100 dark:bg-blue-500/10',
			text: 'text-blue-600 dark:text-blue-400',
			border: 'border-l-blue-500',
			cta: 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
		}
	};

	type PriorityLevel = 'high' | 'medium' | 'low';

	const priorityMap: Record<string, { priority: PriorityLevel; label: string }> = {
		'call.missed': { priority: 'high', label: 'Urgent' },
		'quote.viewed': { priority: 'high', label: 'Act now' },
		'quote.accepted': { priority: 'high', label: 'Action needed' },
		'quote.changes_requested': { priority: 'high', label: 'Action needed' },
		'private_feedback.received': { priority: 'high', label: 'Needs attention' },
		'review.received': { priority: 'medium', label: 'New' },
		'message.received': { priority: 'medium', label: 'New message' },
		'opportunity.won': { priority: 'high', label: 'Won!' },
		'invoice.paid': { priority: 'high', label: 'Paid' },
		'quote.deposit_paid': { priority: 'high', label: 'Deposit' },
		'job.created': { priority: 'medium', label: 'New job' },
		appointment_booked: { priority: 'medium', label: 'Upcoming' },
		contact_follow_up_due: { priority: 'low', label: 'Reminder' },
		opportunity_follow_up_due: { priority: 'medium', label: 'Reminder' },
		opportunity_stale_digest: { priority: 'medium', label: 'Action needed' }
	};

	const priorityColors: Record<PriorityLevel, string> = {
		high: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
		medium:
			'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
		low: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:border-zinc-500/20'
	};

	type CtaAction = { label: string; icon: Component };

	const ctaMap: Record<string, CtaAction> = {
		'call.missed': { label: 'Call back', icon: Phone },
		'message.received': { label: 'Reply', icon: Reply },
		'quote.viewed': { label: 'View quote', icon: ArrowRight },
		'quote.accepted': { label: 'View quote', icon: ArrowRight },
		'quote.changes_requested': { label: 'Review', icon: ArrowRight },
		'quote.deposit_paid': { label: 'View quote', icon: ArrowRight },
		'invoice.paid': { label: 'View invoice', icon: ArrowRight },
		'review.received': { label: 'View review', icon: ArrowRight },
		'private_feedback.received': { label: 'View feedback', icon: ArrowRight },
		'job.created': { label: 'View job', icon: ArrowRight },
		appointment_booked: { label: 'View', icon: ArrowRight },
		'opportunity.won': { label: 'View deal', icon: ArrowRight },
		contact_follow_up_due: { label: 'Follow up', icon: ArrowRight },
		opportunity_follow_up_due: { label: 'View deal', icon: ArrowRight },
		opportunity_stale_digest: { label: 'View pipeline', icon: ArrowRight },
		contact_import_completed: { label: 'View contacts', icon: ArrowRight }
	};

	const Icon = $derived<Component>(iconByType[notification.type] ?? Bell);
	const isUnread = $derived(!notification.read_at);
	const colorScheme = $derived(iconColorMap[notification.type] ?? 'primary');
	const colorClasses = $derived(iconColorClasses[colorScheme]);
	const priorityInfo = $derived(
		priorityMap[notification.type] ??
			({ priority: 'low', label: '' } as {
				priority: PriorityLevel;
				label: string;
			})
	);
	const cta = $derived(ctaMap[notification.type] ?? null);

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

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			void handleClick();
		}
	}

	async function handleCtaClick(e: MouseEvent) {
		e.stopPropagation();
		void notificationStore.markRead(notification.id);
		const href = getNotificationHref(notification);
		onNavigate?.();
		if (href) await goto(href);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	role="button"
	tabindex="0"
	onclick={handleClick}
	onkeydown={handleKeyDown}
	style="animation-delay: {index * 40}ms"
	class={cn(
		'flex w-full flex-col text-left transition-all duration-150 ease-out',
		'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
		'rounded-lg border-l-2',
		isUnread ? colorClasses.border : 'border-l-transparent',
		isUnread ? 'bg-accent/30' : 'bg-transparent',
		'animate-in fade-in slide-in-from-top-1 fill-mode-both duration-200'
	)}
>
	<div class="flex w-full items-start gap-3 px-3 py-3">
		<div
			class={cn(
				'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-150',
				isUnread ? colorClasses.bg + ' ' + colorClasses.text : 'bg-muted text-muted-foreground'
			)}
		>
			<Icon class="h-4 w-4" />
		</div>

		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-1.5">
				{#if priorityInfo.priority === 'high' && isUnread}
					<span
						class={cn(
							'shrink-0 rounded-full border px-1.5 py-px text-[10px] font-semibold leading-tight',
							priorityColors.high
						)}
					>
						{priorityInfo.label}
					</span>
				{/if}
				<p class="truncate text-sm font-medium text-foreground">{notification.title}</p>
			</div>
			<div class="mt-0.5 flex items-center justify-between gap-2">
				{#if notification.body}
					<p class="line-clamp-2 text-xs text-muted-foreground">{notification.body}</p>
				{/if}
				<div class="ml-auto flex shrink-0 items-center gap-1.5">
					<span class="text-[11px] text-muted-foreground">{timeLabel}</span>
					{#if isUnread}
						<span class="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread"></span>
					{/if}
				</div>
			</div>
		</div>
	</div>

	{#if cta && isUnread}
		<div class="flex justify-end px-3 pb-2.5">
			<button
				type="button"
				onclick={handleCtaClick}
				class={cn(
					'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5',
					'text-xs font-medium transition-all duration-150',
					'min-h-[36px]',
					colorClasses.cta
				)}
			>
				<cta.icon class="h-3.5 w-3.5" />
				{cta.label}
			</button>
		</div>
	{/if}
</div>
