<script lang="ts">
	import { goto } from '$app/navigation';
	import { UserCircle, Building2, Settings, LogOut } from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Avatar from '$lib/components/ui/avatar';
	import { cn } from '$lib/utils/cn';
	import MyStatusMenu from './MyStatusMenu.svelte';
	import { effectiveStatus } from '$lib/notifications/memberStatus';
	import { MEMBER_STATUS_MAP } from '$lib/notifications/memberStatusPresets';
	import type { Org, OrgMember } from '$lib/types';

	let { member, org }: { member: OrgMember; org?: Org } = $props();

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

	async function logout() {
		await fetch('/auth/logout', { method: 'POST' });
		goto('/auth/login');
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="inline-flex h-11 w-11 items-center justify-center rounded-full ring-1 ring-primary/10 ring-offset-1 ring-offset-card-raised transition-all duration-200 ease-out hover:ring-primary/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-label="Account menu"
	>
		<span class="relative inline-flex">
			<Avatar.Root class="h-9 w-9">
				{#if member.avatar_url}
					<Avatar.Image src={member.avatar_url} alt={member.full_name} />
				{/if}
				<Avatar.Fallback class="bg-primary/10 text-primary font-semibold"
					>{initials || '?'}</Avatar.Fallback
				>
			</Avatar.Root>
			<span
				class={cn(
					'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card-raised',
					status.dotClass
				)}
				aria-label={`Status: ${status.label}`}
			></span>
		</span>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-60">
		<div class="px-4 py-3">
			<p class="truncate text-sm font-semibold text-foreground">{member.full_name}</p>
			<p class="truncate text-xs text-muted-foreground">{member.email}</p>
		</div>
		<DropdownMenu.Separator />
		<MyStatusMenu {member} />
		<DropdownMenu.Separator />
		<DropdownMenu.Group>
			<DropdownMenu.Label
				class="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
			>
				Settings
			</DropdownMenu.Label>
			<DropdownMenu.Item onSelect={() => goto('/settings/account')}>
				<UserCircle class="h-4 w-4 text-primary" />
				Account
			</DropdownMenu.Item>
			<DropdownMenu.Item onSelect={() => goto('/settings/org')}>
				<Building2 class="h-4 w-4 text-emerald-500" />
				Business
			</DropdownMenu.Item>
			<DropdownMenu.Item onSelect={() => goto('/settings')}>
				<Settings class="h-4 w-4 text-amber-500" />
				Settings
			</DropdownMenu.Item>
		</DropdownMenu.Group>
		<DropdownMenu.Separator />
		<DropdownMenu.Item variant="destructive" onSelect={logout}>
			<LogOut class="h-4 w-4" />
			Logout
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
