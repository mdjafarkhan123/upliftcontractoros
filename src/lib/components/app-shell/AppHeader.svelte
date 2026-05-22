<script lang="ts">
	import type { Org, OrgMember } from '$lib/types';
	import UserMenu from './UserMenu.svelte';
	import OrgAvatar from './OrgAvatar.svelte';
	import ThemeToggle from '$lib/components/shared/ThemeToggle.svelte';
	import NotificationBell from '$lib/components/notifications/NotificationBell.svelte';

	let { org, member }: { org: Org; member: OrgMember } = $props();
</script>

<header
	class="sticky top-0 z-40 border-b border-border/50 bg-background/80 px-3 py-2 backdrop-blur-xl md:border-b-0 md:px-5 md:py-4"
>
	<div
		class="flex min-h-[56px] items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/95 px-3 shadow-dropdown md:min-h-[72px] md:rounded-2xl md:px-5"
	>
		<a
			href="/dashboard"
			class="flex min-w-0 items-center gap-3 rounded-xl pr-2 transition-colors duration-150 ease-out hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			aria-label={org.name}
		>
			<OrgAvatar name={org.name} logoUrl={org.logo_url ?? null} size="md" class="shadow-card" />
			<span class="min-w-0">
				<span
					class="block truncate text-sm font-semibold tracking-tight text-foreground md:text-base"
				>
					{org.name}
				</span>
				<span class="hidden truncate text-xs font-medium text-muted-foreground md:block">
					Contractor OS
				</span>
			</span>
		</a>

		<div class="flex min-w-0 items-center gap-1.5 md:gap-2.5">
			<div
				class="hidden items-center gap-1.5 rounded-full border border-border/70 bg-muted/70 p-1 shadow-card md:flex"
			>
				<ThemeToggle />
				<NotificationBell />
			</div>
			<div class="flex items-center gap-1.5 md:hidden">
				<ThemeToggle />
				<NotificationBell />
			</div>
			<div class="hidden h-8 w-px bg-border/60 md:block" aria-hidden="true"></div>
			<div
				class="flex min-w-0 items-center gap-2 rounded-full border border-border/70 bg-card-raised/90 py-1 pl-3 pr-1 shadow-card"
			>
				<span class="hidden min-w-0 text-right lg:block">
					<span class="block truncate text-sm font-semibold leading-5 text-foreground">
						{member.full_name}
					</span>
					<span class="block truncate text-xs leading-4 text-muted-foreground">{member.email}</span>
				</span>
				<UserMenu {member} {org} />
			</div>
		</div>
	</div>
</header>
