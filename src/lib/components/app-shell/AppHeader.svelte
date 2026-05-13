<script lang="ts">
	import { Bell } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import type { Org, OrgMember } from '$lib/types';
	import UserMenu from './UserMenu.svelte';
	import ThemeToggle from '$lib/components/shared/ThemeToggle.svelte';

	let {
		org,
		member,
		unreadCount = 0
	}: { org: Org; member: OrgMember; unreadCount?: number } = $props();

	const initials = $derived(
		org.name
			.split(' ')
			.map((n) => n[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);
</script>

<header
	class="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:h-16 md:px-6"
>
	<a href="/dashboard" class="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
		{#if org.logo_url}
			<img src={org.logo_url} alt="" class="h-8 w-8 rounded-md object-cover" />
		{:else}
			<div
				class="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground"
			>
				{initials || 'C'}
			</div>
		{/if}
		<span class="truncate text-sm font-semibold text-foreground md:text-base">{org.name}</span>
	</a>

	<div class="flex items-center gap-1 md:gap-2">
		<ThemeToggle />
		<button
			type="button"
			onclick={() => goto('/notifications')}
			class="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			aria-label="Notifications"
		>
			<Bell class="h-5 w-5" />
			{#if unreadCount > 0}
				<span
					class="absolute right-1.5 top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground"
				>
					{unreadCount > 99 ? '99+' : unreadCount}
				</span>
			{/if}
		</button>
		<UserMenu {member} />
	</div>
</header>
