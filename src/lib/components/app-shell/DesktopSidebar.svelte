<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils/cn';
	import type { NavItem } from '$lib/permissions/nav';
	import { SETTINGS_NAV } from '$lib/permissions/nav';
	import type { Org, OrgMember } from '$lib/types';
	import { can } from '$lib/permissions/can';
	import OrgAvatar from './OrgAvatar.svelte';
	import { Search } from '@lucide/svelte';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import { inboxUnreadStore } from '$lib/stores/inboxUnread.svelte';

	let { items, member, org }: { items: NavItem[]; member: OrgMember; org: Org } = $props();

	const inboxBadge = $derived(inboxUnreadStore.count > 9 ? '9+' : String(inboxUnreadStore.count));

	const showSettings = $derived(can(member, 'can_view_team_members'));
	const mainItems = $derived(
		items.filter((item) => ['dashboard', 'inbox', 'contacts', 'pipeline'].includes(item.key))
	);
	const workItems = $derived(
		items.filter((item) => ['jobs', 'quotes', 'invoices', 'appointments'].includes(item.key))
	);
	const growthItems = $derived(items.filter((item) => ['reputation', 'growth'].includes(item.key)));

	const navIconColor: Record<string, string> = {
		dashboard: 'text-primary',
		inbox: 'text-sky-500 dark:text-sky-400',
		contacts: 'text-emerald-500 dark:text-emerald-400',
		pipeline: 'text-amber-500 dark:text-amber-400',
		jobs: 'text-blue-500 dark:text-blue-400',
		quotes: 'text-violet-500 dark:text-violet-400',
		invoices: 'text-rose-500 dark:text-rose-400',
		appointments: 'text-cyan-500 dark:text-cyan-400',
		reputation: 'text-yellow-500 dark:text-yellow-400',
		growth: 'text-orange-500 dark:text-orange-400',
		settings: 'text-slate-400 dark:text-slate-500'
	};

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/dashboard') return path === '/dashboard';
		return path === href || path.startsWith(href + '/');
	}

	function navClass(active: boolean, extra = ''): string {
		return cn(
			'group relative flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
			active
				? 'overflow-hidden bg-primary/20 text-primary shadow-card ring-1 ring-primary/20 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-primary dark:bg-primary/20 dark:text-[hsl(var(--brand-light))] dark:ring-primary/30'
				: 'text-muted-foreground hover:bg-card hover:text-foreground snake-glow dark:hover:bg-card-raised',
			extra
		);
	}
</script>

<aside
	class="fixed inset-y-0 left-0 z-50 hidden w-[var(--sidebar-width)] shrink-0 flex-col border-r border-border/60 bg-sidebar md:flex"
	aria-label="Primary"
>
	<a
		href="/dashboard"
		class="flex h-16 items-center gap-3 border-b border-border/60 px-4 transition-colors duration-150 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
		<!-- Global search trigger -->
		<button
			type="button"
			onclick={() => (commandPalette.open = true)}
			class="group flex min-h-[44px] w-full items-center gap-3 rounded-lg border border-border/50 bg-muted/40 px-3 text-sm text-muted-foreground transition-all duration-150 ease-out hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<Search class="h-4 w-4 shrink-0" />
			<span class="flex-1 truncate text-left">Search…</span>
			<kbd
				class="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] opacity-50 transition-opacity group-hover:opacity-80"
				>⌘K</kbd
			>
		</button>

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
							<Icon class={cn('h-4 w-4 shrink-0', !active && navIconColor[item.key])} />
							<span class="truncate">{item.label}</span>
							{#if item.key === 'inbox' && inboxUnreadStore.count > 0}
								<span
									class="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-sky-500 px-1.5 text-[11px] font-semibold leading-none text-white tabular-nums"
									aria-label="{inboxUnreadStore.count} unread conversations"
								>
									{inboxBadge}
								</span>
							{/if}
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
							<Icon class={cn('h-4 w-4 shrink-0', !active && navIconColor[item.key])} />
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
							<Icon class={cn('h-4 w-4 shrink-0', !active && navIconColor[item.key])} />
							<span class="truncate">{item.label}</span>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if showSettings}
			{@const Icon = SETTINGS_NAV.icon}
			{@const active = isActive(SETTINGS_NAV.href)}
			<div class="mt-auto pt-2 pb-2">
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
					<Icon class={cn('h-4 w-4 shrink-0', !active && navIconColor['settings'])} />
					<span>{SETTINGS_NAV.label}</span>
				</a>
			</div>
		{/if}
	</nav>
</aside>
