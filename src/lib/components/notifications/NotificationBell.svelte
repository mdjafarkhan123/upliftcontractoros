<script lang="ts">
	import { onMount } from 'svelte';
	import * as Popover from '$lib/components/ui/popover';
	import BottomSheet from '$lib/components/shared/BottomSheet.svelte';
	import NotificationPanel from './NotificationPanel.svelte';
	import { notificationStore } from '$lib/stores/notifications.svelte';

	let popoverOpen = $state(false);
	let sheetOpen = $state(false);
	let isDesktop = $state(false);

	const unreadCount = $derived(notificationStore.unreadCount);

	onMount(() => {
		const mq = window.matchMedia('(min-width: 768px)');
		isDesktop = mq.matches;
		const handler = (e: MediaQueryListEvent) => {
			isDesktop = e.matches;
		};
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});

	function openBell() {
		if (isDesktop) {
			popoverOpen = true;
		} else {
			sheetOpen = true;
		}
	}

	function closeAll() {
		popoverOpen = false;
		sheetOpen = false;
	}
</script>

{#if isDesktop}
	<Popover.Root bind:open={popoverOpen}>
		<Popover.Trigger class="topbar__icon-btn" aria-label="Notifications">
			<i class="ri-notification-3-line" aria-hidden="true"></i>
			{#if unreadCount > 0}
				<span class="topbar__icon-btn-badge" aria-label="{unreadCount} unread">
					{unreadCount > 99 ? '99+' : unreadCount}
				</span>
			{/if}
		</Popover.Trigger>
		<Popover.Content align="end" sideOffset={8} class="w-[22rem] p-0">
			<NotificationPanel onNavigate={closeAll} />
		</Popover.Content>
	</Popover.Root>
{:else}
	<button type="button" onclick={openBell} class="topbar__icon-btn" aria-label="Notifications">
		<i class="ri-notification-3-line" aria-hidden="true"></i>
		{#if unreadCount > 0}
			<span class="topbar__icon-btn-badge" aria-label="{unreadCount} unread">
				{unreadCount > 99 ? '99+' : unreadCount}
			</span>
		{/if}
	</button>
	<BottomSheet bind:open={sheetOpen}>
		<div class="-mx-6 -mb-6">
			<NotificationPanel onNavigate={closeAll} />
		</div>
	</BottomSheet>
{/if}
