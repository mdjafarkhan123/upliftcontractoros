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
	import Toaster from '$lib/components/shared/Toaster.svelte';
	import { sessionStore, type AppSessionData } from '$lib/stores/session.svelte';
	import { notificationStore } from '$lib/stores/notifications.svelte';
	import { getBrowserSupabase } from '$lib/supabase/browser';
	import type { NotificationItem } from '$lib/notifications/navigation';

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
				goto('/suspended');
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

	let notificationsChannel: ReturnType<ReturnType<typeof getBrowserSupabase>['channel']> | null =
		null;

	onMount(() => {
		lastFeatureOverridesUpdatedAt = toIso(session.org.feature_overrides_updated_at);
		pollHandle = setInterval(pollStatus, POLL_MS);

		// Skip CRM-side data + realtime entirely while suspended.
		if (session.org.status === 'suspended') return;

		void notificationStore.load(true);
		const supabase = getBrowserSupabase();
		notificationStore.onSubscribed();
		notificationsChannel = supabase
			.channel(`notifications:member:${session.member.id}`)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'notifications',
					filter: `member_id=eq.${session.member.id}`
				},
				(payload: { new: NotificationItem }) => {
					notificationStore.applyRealtimeInsert(payload.new);
				}
			)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'notifications',
					filter: `member_id=eq.${session.member.id}`
				},
				(payload: { new: NotificationItem }) => {
					notificationStore.applyRealtimeUpdate(payload.new);
				}
			)
			.subscribe();
	});
	onDestroy(() => {
		if (pollHandle) clearInterval(pollHandle);
		if (notificationsChannel) {
			void getBrowserSupabase().removeChannel(notificationsChannel);
			notificationsChannel = null;
		}
	});

	const visibleNav = $derived(buildVisibleNav(session.member, session.featureFlags));
	const split = $derived(splitForMobile(visibleNav));
	const showSetupBanner = $derived(!session.org.is_setup_complete && !setupBannerDismissed);
	const isSuspended = $derived(session.org.status === 'suspended');
</script>

{#if isSuspended}
	<div class="min-h-screen bg-background">
		{@render children()}
		<Toaster />
	</div>
{:else}
	<div class="flex min-h-screen flex-col bg-background">
		<DesktopSidebar items={visibleNav} member={session.member} org={session.org} />
		<div class="flex min-h-screen flex-1 flex-col md:pl-[var(--sidebar-width)]">
			<AppHeader org={session.org} member={session.member} />
			{#if showSetupBanner}
				<SetupBanner onDismiss={() => (setupBannerDismissed = true)} />
			{/if}
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
		<Toaster />
	</div>
{/if}
