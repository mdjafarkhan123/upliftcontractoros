<script lang="ts">
	import { goto } from '$app/navigation';
	import { User, Settings, LogOut, ChevronDown } from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Avatar from '$lib/components/ui/avatar';
	import type { OrgMember } from '$lib/types';

	let { member }: { member: OrgMember } = $props();

	const initials = $derived(
		member.full_name
			.split(' ')
			.map((n) => n[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);

	async function logout() {
		await fetch('/auth/logout', { method: 'POST' });
		goto('/auth/login');
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="inline-flex h-11 items-center gap-2 rounded-full pl-1 pr-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-label="Account menu"
	>
		<Avatar.Root class="h-9 w-9">
			{#if member.avatar_url}
				<Avatar.Image src={member.avatar_url} alt={member.full_name} />
			{/if}
			<Avatar.Fallback>{initials || '?'}</Avatar.Fallback>
		</Avatar.Root>
		<ChevronDown class="hidden h-4 w-4 text-muted-foreground md:block" />
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-56">
		<div class="px-3 py-2">
			<p class="truncate text-sm font-medium text-foreground">{member.full_name}</p>
			<p class="truncate text-xs text-muted-foreground">{member.email}</p>
		</div>
		<DropdownMenu.Separator />
		<DropdownMenu.Item onSelect={() => goto('/profile')}>
			<User class="h-4 w-4" />
			Profile
		</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={() => goto('/settings')}>
			<Settings class="h-4 w-4" />
			Settings
		</DropdownMenu.Item>
		<DropdownMenu.Separator />
		<DropdownMenu.Item variant="destructive" onSelect={logout}>
			<LogOut class="h-4 w-4" />
			Logout
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
