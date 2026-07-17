<script lang="ts">
	import { page } from '$app/stores';
	import type { Org, OrgMember } from '$lib/types';
	import UserMenu from './UserMenu.svelte';
	import AddNewMenu from './AddNewMenu.svelte';
	import OrgAvatar from './OrgAvatar.svelte';
	import ThemeToggle from '$lib/components/shared/ThemeToggle.svelte';
	import NotificationBell from '$lib/components/notifications/NotificationBell.svelte';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';

	let { org, member }: { org: Org; member: OrgMember } = $props();

	const PAGE_TITLES: Record<string, string> = {
		'/dashboard': 'Dashboard',
		'/pipeline': 'Pipeline',
		'/contacts': 'Contacts',
		'/requests': 'Requests',
		'/jobs': 'Jobs',
		'/quotes': 'Quotes',
		'/invoices': 'Invoices',
		'/inbox': 'Inbox',
		'/appointments': 'Appointments',
		'/reputation': 'Reputation',
		'/settings': 'Settings',
		'/growth': 'Growth'
	};

	function getPageTitle(pathname: string): string {
		if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
		for (const [path, title] of Object.entries(PAGE_TITLES)) {
			if (pathname.startsWith(path + '/')) return title;
		}
		return '';
	}

	const pageTitle = $derived(getPageTitle($page.url.pathname));
</script>

<header class="topbar">
	<!-- Desktop: current page name -->
	<div class="topbar__left">
		{#if pageTitle}
			<h1 class="topbar__page-title">{pageTitle}</h1>
		{/if}
	</div>

	<!-- Mobile only: org brand -->
	<a href="/dashboard" class="topbar__brand" aria-label={org.name}>
		<OrgAvatar name={org.name} logoUrl={org.logo_url ?? null} size="md" />
		<span class="topbar__brand-name">{org.name}</span>
	</a>

	<!-- Center: search bar + Add new button -->
	<div class="topbar__center">
		<button
			type="button"
			class="topbar__search"
			onclick={() => (commandPalette.open = true)}
			aria-label="Search (⌘K)"
		>
			<i class="ri-search-line" aria-hidden="true"></i>
			<span class="topbar__search-placeholder">Search...</span>
			<kbd class="topbar__search-kbd">⌘K</kbd>
		</button>
		<AddNewMenu {member} />
	</div>

	<!-- Right: theme toggle, notifications, user menu -->
	<div class="topbar__right">
		<ThemeToggle />
		<NotificationBell />
		<div class="topbar__divider" aria-hidden="true"></div>
		<div class="topbar__user-pill">
			<UserMenu {member} {org} />
		</div>
	</div>
</header>
