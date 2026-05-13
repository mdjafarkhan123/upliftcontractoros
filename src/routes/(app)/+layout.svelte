<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { setMemberContext } from '$lib/context/member';
	import { setOrgContext } from '$lib/context/org';
	import {
		setFeatureFlagsContext,
		setLimitsContext,
		setIntegrationStatusContext
	} from '$lib/context/featureFlags';
	import { buildVisibleNav, splitForMobile } from '$lib/permissions/nav';
	import AppHeader from '$lib/components/app-shell/AppHeader.svelte';
	import BottomNav from '$lib/components/app-shell/BottomNav.svelte';
	import DesktopSidebar from '$lib/components/app-shell/DesktopSidebar.svelte';
	import MoreSheet from '$lib/components/app-shell/MoreSheet.svelte';
	import SetupBanner from '$lib/components/app-shell/SetupBanner.svelte';
	import { sessionStore, type AppSessionData } from '$lib/stores/session.svelte';

	let { data, children } = $props<{ data: { session: AppSessionData }; children: () => unknown }>();

	let moreOpen = $state(false);
	let setupBannerDismissed = $state(false);

	// Single source of truth: the rune store. data.session populated it on first load.
	const session = $derived(sessionStore.data ?? data.session);

	setMemberContext(() => session.member);
	setOrgContext(() => session.org);
	setFeatureFlagsContext(() => session.featureFlags);
	setLimitsContext(() => session.limits);
	setIntegrationStatusContext(() => session.integrationStatus);

	const POLL_MS = 20 * 60 * 1000;
	let pollHandle: ReturnType<typeof setInterval> | null = null;
	let lastFeatureOverridesUpdatedAt = $state<string | null>(null);

	function toIso(v: unknown): string | null {
		if (!v) return null;
		try {
			return new Date(v as string).toISOString();
		} catch {
			return null;
		}
	}

	async function pollStatus() {
		try {
			const res = await fetch('/api/session/status');
			if (res.status === 401) {
				sessionStore.remove();
				goto('/auth/login');
				return;
			}
			if (!res.ok) return;
			const body = (await res.json()) as {
				status: string;
				feature_overrides_updated_at: string | null;
			};

			if (body.status === 'suspended') {
				goto('/auth/suspended');
				return;
			}

			const next = toIso(body.feature_overrides_updated_at);
			if (next !== lastFeatureOverridesUpdatedAt) {
				lastFeatureOverridesUpdatedAt = next;
				await sessionStore.load(true);
			}
		} catch {
			// silent — next tick will retry
		}
	}

	onMount(() => {
		lastFeatureOverridesUpdatedAt = toIso(session.org.feature_overrides_updated_at);
		pollHandle = setInterval(pollStatus, POLL_MS);
	});
	onDestroy(() => {
		if (pollHandle) clearInterval(pollHandle);
	});

	const visibleNav = $derived(buildVisibleNav(session.member, session.featureFlags));
	const split = $derived(splitForMobile(visibleNav));
	const showSetupBanner = $derived(!session.org.is_setup_complete && !setupBannerDismissed);
</script>

<div class="flex min-h-screen flex-col bg-background">
	<AppHeader org={session.org} member={session.member} />
	{#if showSetupBanner}
		<SetupBanner onDismiss={() => (setupBannerDismissed = true)} />
	{/if}
	<div class="flex flex-1 md:gap-0">
		<DesktopSidebar items={visibleNav} member={session.member} />
		<main class="flex-1 pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-0">
			{@render children()}
		</main>
	</div>
	<BottomNav
		primary={split.primary}
		hasSecondary={split.secondary.length > 0}
		onMoreClick={() => (moreOpen = true)}
	/>
	<MoreSheet bind:open={moreOpen} items={split.secondary} member={session.member} />
</div>
