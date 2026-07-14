<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
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
		<div class="more-sheet">
			{#each items as item (item.key)}
				{@const active = isActive(item.href)}
				<button
					type="button"
					onclick={() => navigate(item.href)}
					class="more-sheet__item{active ? ' more-sheet__item--active' : ''}"
				>
					<i class="{item.icon} more-sheet__icon" aria-hidden="true"></i>
					<span class="more-sheet__label">{item.label}</span>
				</button>
			{/each}
			{#if showSettings}
				{@const active = isActive(SETTINGS_NAV.href)}
				<button
					type="button"
					onclick={() => navigate(SETTINGS_NAV.href)}
					class="more-sheet__item{active ? ' more-sheet__item--active' : ''}"
				>
					<i class="{SETTINGS_NAV.icon} more-sheet__icon" aria-hidden="true"></i>
					<span class="more-sheet__label">{SETTINGS_NAV.label}</span>
				</button>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.more-sheet {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: $space-2;
		padding-top: $space-2;

		&__item {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: $space-2;
			min-height: 80px;
			padding: $space-3;
			border-radius: $radius-xl;
			border: 1px solid var(--color-border);
			background: none;
			color: var(--color-text-primary);
			font-size: $fs-body;
			font-weight: $weight-medium;
			cursor: pointer;
			transition: background-color $duration-fast $ease-standard,
			            border-color $duration-fast $ease-standard,
			            color $duration-fast $ease-standard;

			&:hover {
				background: var(--color-bg-surface-sunk);
			}

			&:focus-visible {
				outline: none;
				box-shadow: var(--shadow-focus);
			}

			&--active {
				border-color: var(--color-brand);
				background: var(--state-active-tint);
				color: var(--color-brand);

				.more-sheet__icon { color: var(--color-brand); }
			}
		}

		&__icon {
			font-size: 1.25rem;
			line-height: 1;
			color: var(--color-text-secondary);
		}

		&__label {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			max-width: 100%;
		}
	}
</style>
