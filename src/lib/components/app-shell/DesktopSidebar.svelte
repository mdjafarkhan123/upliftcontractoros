<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils/cn';
	import type { NavItem } from '$lib/permissions/nav';
	import { SETTINGS_NAV } from '$lib/permissions/nav';
	import type { Org, OrgMember } from '$lib/types';
	import { can } from '$lib/permissions/can';
	import OrgAvatar from './OrgAvatar.svelte';
	import { Settings } from '@lucide/svelte';

	let { items, member, org }: { items: NavItem[]; member: OrgMember; org: Org } = $props();

	const showSettings = $derived(can(member, 'can_view_team_members'));
	const mainItems = $derived(
		items.filter((item) => ['dashboard', 'inbox', 'contacts', 'pipeline'].includes(item.key))
	);
	const workItems = $derived(
		items.filter((item) => ['jobs', 'quotes', 'invoices', 'appointments'].includes(item.key))
	);
	const growthItems = $derived(items.filter((item) => ['reputation', 'growth'].includes(item.key)));
	const memberInitials = $derived(
		member.full_name
			.split(' ')
			.map((n) => n[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase() || '?'
	);

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/dashboard') return path === '/dashboard';
		return path === href || path.startsWith(href + '/');
	}

	function navClass(active: boolean, extra = ''): string {
		return cn(
			'group relative flex min-h-[44px] w-full items-center gap-3 overflow-hidden rounded-lg px-3 text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
			active
				? 'bg-primary/20 text-primary shadow-card ring-1 ring-primary/20 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-primary dark:bg-primary/20 dark:text-[hsl(var(--brand-light))] dark:ring-primary/30'
				: 'text-muted-foreground hover:bg-card/80 hover:text-foreground dark:hover:bg-card-raised/80',
			extra
		);
	}
</script>

<aside
	class="fixed inset-y-0 left-0 z-50 hidden w-[var(--sidebar-width)] shrink-0 flex-col border-r border-border/70 bg-sidebar shadow-[1px_0_0_hsl(0_0%_100%/0.03)_inset] md:flex"
	aria-label="Primary"
>
	<a
		href="/dashboard"
		class="flex h-16 items-center gap-3 border-b border-border/70 px-4 transition-colors duration-150 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		<OrgAvatar name={org.name} logoUrl={org.logo_url ?? null} size="md" class="shadow-card" />
		<span class="min-w-0">
			<span class="block truncate text-sm font-semibold tracking-tight text-foreground"
				>{org.name}</span
			>
			<span class="block truncate text-xs text-muted-foreground">Contractor OS</span>
		</span>
	</a>

	<nav class="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
		{#if mainItems.length > 0}
			<div>
				<p
					class="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70"
				>
					Main
				</p>
				<div class="space-y-0.5">
					{#each mainItems as item (item.key)}
						{@const Icon = item.icon}
						{@const active = isActive(item.href)}
						<a href={item.href} class={navClass(active)} aria-current={active ? 'page' : undefined}>
							<Icon class="h-4 w-4 shrink-0" />
							<span class="truncate">{item.label}</span>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if workItems.length > 0}
			<div>
				<p
					class="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70"
				>
					Work
				</p>
				<div class="space-y-0.5">
					{#each workItems as item (item.key)}
						{@const Icon = item.icon}
						{@const active = isActive(item.href)}
						<a href={item.href} class={navClass(active)} aria-current={active ? 'page' : undefined}>
							<Icon class="h-4 w-4 shrink-0" />
							<span class="truncate">{item.label}</span>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if growthItems.length > 0}
			<div>
				<p
					class="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70"
				>
					Growth
				</p>
				<div class="space-y-0.5">
					{#each growthItems as item (item.key)}
						{@const Icon = item.icon}
						{@const active = isActive(item.href)}
						<a href={item.href} class={navClass(active)} aria-current={active ? 'page' : undefined}>
							<Icon class="h-4 w-4 shrink-0" />
							<span class="truncate">{item.label}</span>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if showSettings}
			{@const Icon = SETTINGS_NAV.icon}
			{@const active = isActive(SETTINGS_NAV.href)}
			<div class="mt-auto pt-2">
				<p
					class="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70"
				>
					System
				</p>
				<a
					href={SETTINGS_NAV.href}
					class={navClass(active)}
					aria-current={active ? 'page' : undefined}
				>
					<Icon class="h-4 w-4 shrink-0" />
					<span>{SETTINGS_NAV.label}</span>
				</a>
			</div>
		{/if}
	</nav>

	<a
		href="/settings/account"
		class="m-3 flex min-h-[56px] items-center gap-3 rounded-xl border border-border/70 bg-card/80 px-3 shadow-card transition-all duration-150 ease-out hover:border-primary/30 hover:bg-card-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		<span
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
		>
			{memberInitials}
		</span>
		<span class="min-w-0 flex-1">
			<span class="block truncate text-sm font-medium text-foreground">{member.full_name}</span>
			<span class="block truncate text-xs text-muted-foreground">{member.email}</span>
		</span>
		<Settings class="h-4 w-4 shrink-0 text-muted-foreground" />
	</a>
</aside>
