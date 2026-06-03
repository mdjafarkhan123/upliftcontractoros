<script lang="ts">
	import { Bell } from '@lucide/svelte';
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

{#snippet bellButton(label: string)}
	<span
		class="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-label={label}
	>
		<Bell class="h-5 w-5" />
		{#if unreadCount > 0}
			<span
				class="absolute right-1.5 top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
			>
				{unreadCount > 99 ? '99+' : unreadCount}
			</span>
		{/if}
	</span>
{/snippet}

{#if isDesktop}
	<Popover.Root bind:open={popoverOpen}>
		<Popover.Trigger
			class="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			aria-label="Notifications"
		>
			{@render bellButton('Notifications')}
		</Popover.Trigger>
		<Popover.Content align="end" sideOffset={8} class="w-[22rem] p-0">
			<NotificationPanel onNavigate={closeAll} />
		</Popover.Content>
	</Popover.Root>
{:else}
	<button
		type="button"
		onclick={openBell}
		class="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-label="Notifications"
	>
		{@render bellButton('Notifications')}
	</button>
	<BottomSheet bind:open={sheetOpen}>
		<div class="-mx-6 -mb-6">
			<NotificationPanel onNavigate={closeAll} />
		</div>
	</BottomSheet>
{/if}
