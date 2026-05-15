<script lang="ts">
	import type { Org, OrgMember } from '$lib/types';
	import UserMenu from './UserMenu.svelte';
	import ThemeToggle from '$lib/components/shared/ThemeToggle.svelte';
	import NotificationBell from '$lib/components/notifications/NotificationBell.svelte';

	let { org, member }: { org: Org; member: OrgMember } = $props();

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
		<NotificationBell />
		<UserMenu {member} />
	</div>
</header>
