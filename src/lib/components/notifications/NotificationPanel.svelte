<script lang="ts">
	import { Bell, ChevronRight } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import NotificationItem from './NotificationItem.svelte';
	import { notificationStore } from '$lib/stores/notifications.svelte';
	import type { NotificationItem as NotificationItemType } from '$lib/notifications/navigation';

	let {
		onNavigate,
		variant = 'panel'
	}: {
		onNavigate?: () => void;
		variant?: 'panel' | 'page';
	} = $props();

	const rawItems = $derived(notificationStore.items);
	const unreadCount = $derived(notificationStore.unreadCount);
	const status = $derived(notificationStore.status);
	const showSkeleton = $derived(status === 'loading' && rawItems.length === 0);
	const showEmpty = $derived(rawItems.length === 0 && status !== 'loading');

	// Priority mapping derived from notification type
	type PriorityLevel = 'high' | 'medium' | 'low';

	const priorityMap: Record<string, PriorityLevel> = {
		'call.missed': 'high',
		'quote.viewed': 'high',
		'quote.accepted': 'high',
		'quote.changes_requested': 'high',
		'private_feedback.received': 'high',
		'opportunity.won': 'high',
		'invoice.paid': 'high',
		'quote.deposit_paid': 'high',
		'review.received': 'medium',
		'message.received': 'medium',
		'job.created': 'medium',
		appointment_booked: 'medium',
		contact_follow_up_due: 'low'
	};

	const priorityOrder: Record<PriorityLevel, number> = { high: 0, medium: 1, low: 2 };

	function getPriority(type: string): PriorityLevel {
		return priorityMap[type] ?? 'low';
	}

	// Sort by priority then created_at descending
	const sortedItems = $derived(
		[...rawItems].sort((a, b) => {
			const pa = priorityOrder[getPriority(a.type)];
			const pb = priorityOrder[getPriority(b.type)];
			if (pa !== pb) return pa - pb;
			return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
		})
	);

	// Time-based grouping
	type TimeGroup = 'today' | 'yesterday' | 'this_week' | 'earlier';

	function getTimeGroup(iso: string): TimeGroup {
		const then = new Date(iso);
		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
		const weekStart = new Date(todayStart.getTime() - 6 * 86_400_000);

		if (then >= todayStart) return 'today';
		if (then >= yesterdayStart) return 'yesterday';
		if (then >= weekStart) return 'this_week';
		return 'earlier';
	}

	const groupLabels: Record<TimeGroup, string> = {
		today: 'Today',
		yesterday: 'Yesterday',
		this_week: 'This week',
		earlier: 'Earlier'
	};

	const groupedItems = $derived.by(() => {
		const groups: { key: TimeGroup; label: string; items: NotificationItemType[] }[] = [];
		const order: TimeGroup[] = ['today', 'yesterday', 'this_week', 'earlier'];

		for (const key of order) {
			const groupItems = sortedItems.filter((n) => getTimeGroup(n.created_at) === key);
			if (groupItems.length > 0) {
				groups.push({ key, label: groupLabels[key], items: groupItems });
			}
		}

		return groups;
	});

	// Flatten for index-based animation stagger
	const flatItems = $derived(groupedItems.flatMap((g) => g.items));

	function getGlobalIndex(itemId: string): number {
		return flatItems.findIndex((n) => n.id === itemId);
	}

	async function handleViewAll() {
		onNavigate?.();
		await goto('/notifications');
	}
</script>

<div class="flex h-full flex-col">
	<header class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
		<div class="flex items-center gap-2">
			<h2 class="text-sm font-semibold text-foreground">Notifications</h2>
			{#if unreadCount > 0}
				<span
					class="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground"
				>
					{unreadCount > 99 ? '99+' : unreadCount}
				</span>
			{/if}
		</div>
		{#if unreadCount > 0}
			<Button
				variant="ghost"
				size="sm"
				onclick={() => notificationStore.markAllRead()}
				class="min-h-[44px]"
			>
				Mark all read
			</Button>
		{/if}
	</header>

	<div
		class={variant === 'panel'
			? 'max-h-[60vh] flex-1 overflow-y-auto p-2'
			: 'flex-1 overflow-y-auto p-2'}
	>
		{#if showSkeleton}
			<div class="p-2">
				<SkeletonLoader lines={5} label="Loading notifications" />
			</div>
		{:else if showEmpty}
			<div class="p-2">
				<EmptyState
					icon={Bell}
					title="You're all caught up"
					description="New activity will show up here."
				/>
			</div>
		{:else}
			{#each groupedItems as group (group.key)}
				<div class="mb-1">
					<p
						class="sticky top-0 z-10 bg-background px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
					>
						{group.label}
					</p>
					<ul class="flex flex-col gap-0.5">
						{#each group.items as n (n.id)}
							<li>
								<NotificationItem notification={n} {onNavigate} index={getGlobalIndex(n.id)} />
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		{/if}
	</div>

	{#if variant === 'panel' && !showSkeleton && !showEmpty}
		<footer class="border-t border-border px-3 py-2">
			<button
				type="button"
				onclick={handleViewAll}
				class="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground min-h-[44px]"
			>
				View all notifications
				<ChevronRight class="h-4 w-4" />
			</button>
		</footer>
	{/if}
</div>
