<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils/cn';
	import type { NavItem } from '$lib/permissions/nav';
	import { SETTINGS_NAV } from '$lib/permissions/nav';
	import type { OrgMember } from '$lib/types';
	import { can } from '$lib/permissions/can';

	let { items, member }: { items: NavItem[]; member: OrgMember } = $props();

	const showSettings = $derived(can(member, 'can_view_team_members'));

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/dashboard') return path === '/dashboard';
		return path === href || path.startsWith(href + '/');
	}
</script>

<aside
	class="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-border bg-background/40 px-3 py-6 md:block"
	aria-label="Primary"
>
	<nav class="flex flex-col gap-1">
		{#each items as item (item.key)}
			{@const Icon = item.icon}
			{@const active = isActive(item.href)}
			<a
				href={item.href}
				class={cn(
					'inline-flex min-h-[44px] items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
					active
						? 'bg-primary/10 text-primary'
						: 'text-foreground/80 hover:bg-accent hover:text-foreground'
				)}
				aria-current={active ? 'page' : undefined}
			>
				<Icon class="h-4 w-4" />
				<span>{item.label}</span>
			</a>
		{/each}
		{#if showSettings}
			{@const Icon = SETTINGS_NAV.icon}
			{@const active = isActive(SETTINGS_NAV.href)}
			<a
				href={SETTINGS_NAV.href}
				class={cn(
					'mt-4 inline-flex min-h-[44px] items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
					active
						? 'bg-primary/10 text-primary'
						: 'text-foreground/80 hover:bg-accent hover:text-foreground'
				)}
				aria-current={active ? 'page' : undefined}
			>
				<Icon class="h-4 w-4" />
				<span>{SETTINGS_NAV.label}</span>
			</a>
		{/if}
	</nav>
</aside>
