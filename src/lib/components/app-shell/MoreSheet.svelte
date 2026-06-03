<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { cn } from '$lib/utils/cn';
	import * as Sheet from '$lib/components/ui/sheet';
	import type { NavItem } from '$lib/permissions/nav';
	import { SETTINGS_NAV } from '$lib/permissions/nav';
	import type { OrgMember } from '$lib/types';
	import { can } from '$lib/permissions/can';

	let {
		open = $bindable(false),
		items,
		member
	}: { open?: boolean; items: NavItem[]; member: OrgMember } = $props();

	const showSettings = $derived(can(member, 'can_view_team_members'));

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		return path === href || path.startsWith(href + '/');
	}

	function navigate(href: string) {
		open = false;
		goto(href);
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="bottom">
		<Sheet.Header>
			<Sheet.Title>More</Sheet.Title>
		</Sheet.Header>
		<div class="grid grid-cols-3 gap-2 pt-2">
			{#each items as item (item.key)}
				{@const Icon = item.icon}
				{@const active = isActive(item.href)}
				<button
					type="button"
					onclick={() => navigate(item.href)}
					class={cn(
						'flex min-h-[80px] flex-col items-center justify-center gap-2 rounded-xl border border-border px-3 py-3 text-xs font-medium transition-colors',
						active
							? 'border-primary/40 bg-primary/10 text-primary'
							: 'text-foreground hover:bg-accent'
					)}
				>
					<Icon class="h-5 w-5" />
					<span class="truncate">{item.label}</span>
				</button>
			{/each}
			{#if showSettings}
				{@const Icon = SETTINGS_NAV.icon}
				<button
					type="button"
					onclick={() => navigate(SETTINGS_NAV.href)}
					class="flex min-h-[80px] flex-col items-center justify-center gap-2 rounded-xl border border-border px-3 py-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
				>
					<Icon class="h-5 w-5" />
					<span>Settings</span>
				</button>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>
