<script lang="ts">
	import { goto } from '$app/navigation';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import MyStatusMenu from './MyStatusMenu.svelte';
	import { effectiveStatus } from '$lib/notifications/memberStatus';
	import { MEMBER_STATUS_MAP } from '$lib/notifications/memberStatusPresets';
	import type { Org, OrgMember } from '$lib/types';

	let { member, org }: { member: OrgMember; org?: Org } = $props();

	let avatarFailed = $state(false);

	const initials = $derived(
		member.full_name
			.split(' ')
			.map((n) => n[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);

	const status = $derived(
		MEMBER_STATUS_MAP[
			effectiveStatus(member.notification_status, member.notification_status_expires_at)
		]
	);

	const showAvatar = $derived(Boolean(member.avatar_url) && !avatarFailed);

	async function logout() {
		await fetch('/auth/logout', { method: 'POST' });
		goto('/auth/login');
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger class="topbar__user-trigger" aria-label="Account menu">
		<span class="topbar__user-avatar">
			{#if showAvatar}
				<img
					class="topbar__user-avatar-img"
					src={member.avatar_url}
					alt=""
					onerror={() => (avatarFailed = true)}
				/>
			{:else}
				<span class="topbar__user-avatar-initials">{initials || '?'}</span>
			{/if}
		</span>
		<span
			class="topbar__user-status-dot"
			style="background: {status.dotColor}"
			aria-label="Status: {status.label}"
		></span>
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end">
		<div class="user-menu__header">
			<p class="user-menu__name">{member.full_name}</p>
			<p class="user-menu__email">{member.email}</p>
		</div>
		<DropdownMenu.Separator />
		<MyStatusMenu {member} />
		<DropdownMenu.Separator />
		<DropdownMenu.Group>
			<DropdownMenu.Label>Settings</DropdownMenu.Label>
			<DropdownMenu.Item onSelect={() => goto('/settings/account')}>
				<i class="ri-user-line user-menu__ico user-menu__ico--brand" aria-hidden="true"></i>
				Account
			</DropdownMenu.Item>
			<DropdownMenu.Item onSelect={() => goto('/settings/org')}>
				<i class="ri-building-2-line user-menu__ico user-menu__ico--success" aria-hidden="true"></i>
				Business
			</DropdownMenu.Item>
			<DropdownMenu.Item onSelect={() => goto('/settings')}>
				<i class="ri-settings-3-line user-menu__ico user-menu__ico--warning" aria-hidden="true"></i>
				Settings
			</DropdownMenu.Item>
		</DropdownMenu.Group>
		<DropdownMenu.Separator />
		<DropdownMenu.Item variant="destructive" onSelect={logout}>
			<i class="ri-logout-box-r-line" aria-hidden="true"></i>
			Logout
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.user-menu {
		&__header {
			padding: $space-3 $space-4;
		}

		&__name {
			margin: 0;
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		&__email {
			margin: 2px 0 0;
			font-size: $fs-body;
			color: var(--color-text-muted);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		&__ico {
			font-size: 16px;
			flex-shrink: 0;

			&--brand {
				color: var(--color-brand);
			}
			&--success {
				color: var(--success-solid);
			}
			&--warning {
				color: var(--warning-solid);
			}
		}
	}
</style>
