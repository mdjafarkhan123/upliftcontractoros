<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils/cn';
	import type { NavItem } from '$lib/permissions/nav';
	import { MORE_ITEM } from '$lib/permissions/nav';

	let {
		primary,
		hasSecondary,
		onMoreClick
	}: { primary: NavItem[]; hasSecondary: boolean; onMoreClick: () => void } = $props();

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/dashboard') return path === '/dashboard';
		return path === href || path.startsWith(href + '/');
	}
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-30 flex h-[var(--bottom-nav-height)] items-stretch border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
	aria-label="Primary"
>
	{#each primary as item (item.key)}
		{@const Icon = item.icon}
		{@const active = isActive(item.href)}
		<a
			href={item.href}
			class={cn(
				'flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
				active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
			)}
			aria-current={active ? 'page' : undefined}
		>
			<Icon class="h-5 w-5" />
			<span class="truncate">{item.label}</span>
		</a>
	{/each}
	{#if hasSecondary}
		{@const MoreIcon = MORE_ITEM.icon}
		<button
			type="button"
			onclick={onMoreClick}
			class="flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
			aria-label="More navigation"
		>
			<MoreIcon class="h-5 w-5" />
			<span>More</span>
		</button>
	{/if}
</nav>
