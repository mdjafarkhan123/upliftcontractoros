<script lang="ts">
	import { goto } from '$app/navigation';
	import { notificationStore } from '$lib/stores/notifications.svelte';
	import { getNotificationHref, type NotificationItem } from '$lib/notifications/navigation';

	let {
		notification,
		onNavigate,
		index = 0
	}: {
		notification: NotificationItem;
		onNavigate?: () => void;
		index?: number;
	} = $props();

	const iconByType: Record<string, string> = {
		'opportunity.won': 'ri-trophy-line',
		'job.created': 'ri-briefcase-line',
		'invoice.paid': 'ri-money-dollar-circle-line',
		'quote.viewed': 'ri-eye-line',
		'quote.accepted': 'ri-checkbox-circle-line',
		'quote.changes_requested': 'ri-chat-3-line',
		'quote.deposit_paid': 'ri-money-dollar-circle-line',
		'review.received': 'ri-star-line',
		'private_feedback.received': 'ri-thumb-down-line',
		'message.received': 'ri-chat-3-line',
		'call.missed': 'ri-phone-line',
		appointment_booked: 'ri-calendar-check-line',
		contact_follow_up_due: 'ri-calendar-schedule-line',
		opportunity_follow_up_due: 'ri-calendar-schedule-line',
		opportunity_stale_digest: 'ri-calendar-schedule-line',
		contact_import_completed: 'ri-upload-2-line'
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

	const ctaMap: Record<string, { label: string; icon: string }> = {
		'call.missed': { label: 'Call back', icon: 'ri-phone-line' },
		'message.received': { label: 'Reply', icon: 'ri-reply-line' },
		'quote.viewed': { label: 'View quote', icon: 'ri-arrow-right-line' },
		'quote.accepted': { label: 'View quote', icon: 'ri-arrow-right-line' },
		'quote.changes_requested': { label: 'Review', icon: 'ri-arrow-right-line' },
		'quote.deposit_paid': { label: 'View quote', icon: 'ri-arrow-right-line' },
		'invoice.paid': { label: 'View invoice', icon: 'ri-arrow-right-line' },
		'review.received': { label: 'View review', icon: 'ri-arrow-right-line' },
		'private_feedback.received': { label: 'View feedback', icon: 'ri-arrow-right-line' },
		'job.created': { label: 'View job', icon: 'ri-arrow-right-line' },
		appointment_booked: { label: 'View', icon: 'ri-arrow-right-line' },
		'opportunity.won': { label: 'View deal', icon: 'ri-arrow-right-line' },
		contact_follow_up_due: { label: 'Follow up', icon: 'ri-arrow-right-line' },
		opportunity_follow_up_due: { label: 'View deal', icon: 'ri-arrow-right-line' },
		opportunity_stale_digest: { label: 'View pipeline', icon: 'ri-arrow-right-line' },
		contact_import_completed: { label: 'View contacts', icon: 'ri-arrow-right-line' }
	};

	const iconClass = $derived(iconByType[notification.type] ?? 'ri-notification-3-line');
	const isUnread = $derived(!notification.read_at);
	const colorScheme = $derived(iconColorMap[notification.type] ?? 'primary');
	const priorityInfo = $derived(
		priorityMap[notification.type] ?? { priority: 'low' as PriorityLevel, label: '' }
	);
	const cta = $derived(ctaMap[notification.type] ?? null);
	const schemeClass = $derived(isUnread ? `noti--unread noti--${colorScheme}` : '');

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
	class="noti {schemeClass}"
>
	<div class="noti__row">
		<div class="noti__icon">
			<i class={iconClass} aria-hidden="true"></i>
		</div>

		<div class="noti__main">
			<div class="noti__title-row">
				{#if priorityInfo.priority === 'high' && isUnread}
					<span class="noti__priority">{priorityInfo.label}</span>
				{/if}
				<p class="noti__title">{notification.title}</p>
			</div>
			<div class="noti__sub-row">
				{#if notification.body}
					<p class="noti__body">{notification.body}</p>
				{/if}
				<div class="noti__meta">
					<span class="noti__time">{timeLabel}</span>
					{#if isUnread}
						<span class="noti__dot" aria-label="Unread"></span>
					{/if}
				</div>
			</div>
		</div>
	</div>

	{#if cta && isUnread}
		<div class="noti__cta-row">
			<button type="button" class="noti__cta" onclick={handleCtaClick}>
				<i class={cta.icon} aria-hidden="true"></i>
				{cta.label}
			</button>
		</div>
	{/if}
</div>
