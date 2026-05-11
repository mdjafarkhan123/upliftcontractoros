<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Loader2 } from '@lucide/svelte';
	import { setMemberContext } from '$lib/context/member';
	import { setOrgContext } from '$lib/context/org';
	import { buildVisibleNav, splitForMobile } from '$lib/permissions/nav';
	import AppHeader from '$lib/components/app-shell/AppHeader.svelte';
	import BottomNav from '$lib/components/app-shell/BottomNav.svelte';
	import DesktopSidebar from '$lib/components/app-shell/DesktopSidebar.svelte';
	import MoreSheet from '$lib/components/app-shell/MoreSheet.svelte';
	import type { Org, OrgMember } from '$lib/types';

	let { children } = $props();

	let session = $state<{ org: Org; member: OrgMember } | null>(null);
	let loadError = $state<string | null>(null);
	let moreOpen = $state(false);

	setMemberContext(() => {
		if (!session) throw new Error('member context read before session loaded');
		return session.member;
	});
	setOrgContext(() => {
		if (!session) throw new Error('org context read before session loaded');
		return session.org;
	});

	async function fetchSession() {
		try {
			const res = await fetch('/api/auth/me');
			if (res.status === 401) {
				goto('/auth/login');
				return;
			}
			if (!res.ok) {
				loadError = 'Failed to load session';
				return;
			}
			session = await res.json();
		} catch {
			loadError = 'Failed to load session';
		}
	}

	$effect(() => {
		fetchSession();
	});

	$effect(() => {
		if (!session) return;
		const path = page.url.pathname;
		if (session.org.status === 'suspended') {
			goto('/auth/suspended');
			return;
		}
		if (!session.org.is_setup_complete && path !== '/setup') {
			goto('/setup');
			return;
		}
		if (session.org.is_setup_complete && path === '/setup') {
			goto('/dashboard');
		}
	});

	const visibleNav = $derived(session ? buildVisibleNav(session.member) : []);
	const split = $derived(splitForMobile(visibleNav));
</script>

{#if !session}
	<div class="flex min-h-screen items-center justify-center bg-background">
		{#if loadError}
			<div class="text-center">
				<p class="text-sm text-destructive">{loadError}</p>
				<button
					type="button"
					class="mt-3 text-sm font-medium text-primary underline"
					onclick={() => {
						loadError = null;
						fetchSession();
					}}
				>
					Retry
				</button>
			</div>
		{:else}
			<Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
		{/if}
	</div>
{:else}
	<div class="flex min-h-screen flex-col bg-background">
		<AppHeader org={session.org} member={session.member} />
		<div class="flex flex-1 md:gap-0">
			<DesktopSidebar items={visibleNav} member={session.member} />
			<main
				class="flex-1 pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-0"
			>
				{@render children?.()}
			</main>
		</div>
		<BottomNav
			primary={split.primary}
			hasSecondary={split.secondary.length > 0}
			onMoreClick={() => (moreOpen = true)}
		/>
		<MoreSheet bind:open={moreOpen} items={split.secondary} member={session.member} />
	</div>
{/if}
