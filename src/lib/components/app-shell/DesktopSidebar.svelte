<script lang="ts">
	import { page } from '$app/state';
	import type { NavItem } from '$lib/permissions/nav';
	import { SETTINGS_NAV } from '$lib/permissions/nav';
	import type { Org, OrgMember } from '$lib/types';
	import { can } from '$lib/permissions/can';
	import OrgAvatar from './OrgAvatar.svelte';
	import { inboxUnreadStore } from '$lib/stores/inboxUnread.svelte';

	let { items, member, org }: { items: NavItem[]; member: OrgMember; org: Org } = $props();

	const inboxBadge = $derived(inboxUnreadStore.count > 9 ? '9+' : String(inboxUnreadStore.count));
	const showSettings = $derived(can(member, 'can_view_team_members'));

	// Per-item icon tone — gives each destination its own color like the
	// quick-create menu, instead of a monochrome rail. Colors defined in
	// _sidebar.scss (.sidebar__nav-icon--*).
	const TONES: Record<string, string> = {
		dashboard: 'brand',
		inbox: 'blue',
		contacts: 'violet',
		pipeline: 'indigo',
		jobs: 'teal',
		quotes: 'sky',
		invoices: 'green',
		appointments: 'amber',
		reputation: 'rose',
		growth: 'emerald',
		settings: 'slate'
	};
	const tone = (key: string): string => TONES[key] ?? 'brand';

	const mainItems = $derived(
		items.filter((item) => ['dashboard', 'inbox', 'contacts', 'pipeline'].includes(item.key))
	);
	const workItems = $derived(
		items.filter((item) => ['jobs', 'quotes', 'invoices', 'appointments'].includes(item.key))
	);
	const growthItems = $derived(items.filter((item) => ['reputation', 'growth'].includes(item.key)));

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/dashboard') return path === '/dashboard';
		return path === href || path.startsWith(href + '/');
	}
</script>

<aside class="sidebar" aria-label="Primary">
	<a href="/dashboard" class="sidebar__header">
		<OrgAvatar name={org.name} logoUrl={org.logo_url ?? null} size="md" />
		<span class="sidebar__org-info">
			<span class="sidebar__org-name">{org.name}</span>
			<span class="sidebar__org-sub">Contractor OS</span>
		</span>
	</a>

	<nav class="sidebar__body">
		{#if mainItems.length > 0}
			<div class="sidebar__section">
				<p class="sidebar__section-label">Main</p>
				{#each mainItems as item (item.key)}
					{@const active = isActive(item.href)}
					<a
						href={item.href}
						class="sidebar__nav-item{active ? ' sidebar__nav-item--active' : ''}"
						aria-current={active ? 'page' : undefined}
					>
						<i
							class="{item.icon} sidebar__nav-icon sidebar__nav-icon--{tone(item.key)}"
							aria-hidden="true"
						></i>
						<span class="sidebar__nav-label">{item.label}</span>
						{#if item.key === 'inbox' && inboxUnreadStore.count > 0}
							<span
								class="sidebar__nav-badge"
								aria-label="{inboxUnreadStore.count} unread conversations"
							>
								{inboxBadge}
							</span>
						{/if}
					</a>
				{/each}
			</div>
		{/if}

		{#if workItems.length > 0}
			<div class="sidebar__section">
				<p class="sidebar__section-label">Work</p>
				{#each workItems as item (item.key)}
					{@const active = isActive(item.href)}
					<a
						href={item.href}
						class="sidebar__nav-item{active ? ' sidebar__nav-item--active' : ''}"
						aria-current={active ? 'page' : undefined}
					>
						<i
							class="{item.icon} sidebar__nav-icon sidebar__nav-icon--{tone(item.key)}"
							aria-hidden="true"
						></i>
						<span class="sidebar__nav-label">{item.label}</span>
					</a>
				{/each}
			</div>
		{/if}

		{#if growthItems.length > 0}
			<div class="sidebar__section">
				<p class="sidebar__section-label">Growth</p>
				{#each growthItems as item (item.key)}
					{@const active = isActive(item.href)}
					<a
						href={item.href}
						class="sidebar__nav-item{active ? ' sidebar__nav-item--active' : ''}"
						aria-current={active ? 'page' : undefined}
					>
						<i
							class="{item.icon} sidebar__nav-icon sidebar__nav-icon--{tone(item.key)}"
							aria-hidden="true"
						></i>
						<span class="sidebar__nav-label">{item.label}</span>
					</a>
				{/each}
			</div>
		{/if}

		{#if showSettings}
			{@const active = isActive(SETTINGS_NAV.href)}
			<div class="sidebar__section sidebar__section--footer">
				<p class="sidebar__section-label">System</p>
				<a
					href={SETTINGS_NAV.href}
					class="sidebar__nav-item{active ? ' sidebar__nav-item--active' : ''}"
					aria-current={active ? 'page' : undefined}
				>
					<i
						class="{SETTINGS_NAV.icon} sidebar__nav-icon sidebar__nav-icon--{tone(
							SETTINGS_NAV.key
						)}"
						aria-hidden="true"
					></i>
					<span class="sidebar__nav-label">{SETTINGS_NAV.label}</span>
				</a>
			</div>
		{/if}
	</nav>
</aside>
