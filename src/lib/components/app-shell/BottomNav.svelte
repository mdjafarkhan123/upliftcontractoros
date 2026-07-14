<script lang="ts">
	import { page } from '$app/state';
	import type { NavItem } from '$lib/permissions/nav';
	import { MORE_ITEM } from '$lib/permissions/nav';
	import { inboxUnreadStore } from '$lib/stores/inboxUnread.svelte';

	let {
		primary,
		hasSecondary,
		onMoreClick
	}: { primary: NavItem[]; hasSecondary: boolean; onMoreClick: () => void } = $props();

	const inboxBadge = $derived(inboxUnreadStore.count > 9 ? '9+' : String(inboxUnreadStore.count));

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/dashboard') return path === '/dashboard';
		return path === href || path.startsWith(href + '/');
	}
</script>

<nav class="bottom-nav" aria-label="Primary">
	{#each primary as item (item.key)}
		{@const active = isActive(item.href)}
		<a
			href={item.href}
			class="bottom-nav__link{active ? ' bottom-nav__link--active' : ''}"
			aria-current={active ? 'page' : undefined}
		>
			<span class="bottom-nav__icon-wrap">
				<i class="{item.icon} bottom-nav__icon" aria-hidden="true"></i>
				{#if item.key === 'inbox' && inboxUnreadStore.count > 0}
					<span
						class="bottom-nav__badge"
						aria-label="{inboxUnreadStore.count} unread conversations"
					>
						{inboxBadge}
					</span>
				{/if}
			</span>
			<span class="bottom-nav__label">{item.label}</span>
		</a>
	{/each}
	{#if hasSecondary}
		<button
			type="button"
			onclick={onMoreClick}
			class="bottom-nav__more"
			aria-label="More navigation"
		>
			<i class="{MORE_ITEM.icon} bottom-nav__icon" aria-hidden="true"></i>
			<span class="bottom-nav__label">More</span>
		</button>
	{/if}
</nav>
