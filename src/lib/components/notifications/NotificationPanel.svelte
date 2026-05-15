<script lang="ts">
	import { Bell } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import NotificationItem from './NotificationItem.svelte';
	import { notificationStore } from '$lib/stores/notifications.svelte';

	let { onNavigate, variant = 'panel' }: { onNavigate?: () => void; variant?: 'panel' | 'page' } = $props();

	const items = $derived(notificationStore.items);
	const unreadCount = $derived(notificationStore.unreadCount);
	const status = $derived(notificationStore.status);
	const showSkeleton = $derived(status === 'loading' && items.length === 0);
	const showEmpty = $derived(items.length === 0 && status !== 'loading');
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
		<Button
			variant="ghost"
			size="sm"
			disabled={unreadCount === 0}
			onclick={() => notificationStore.markAllRead()}
		>
			Mark all read
		</Button>
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
			<ul class="flex flex-col gap-1">
				{#each items as n (n.id)}
					<li>
						<NotificationItem notification={n} {onNavigate} />
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
