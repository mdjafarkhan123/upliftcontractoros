<script lang="ts">
	import { goto, preloadCode } from '$app/navigation';
	import { browser } from '$app/environment';
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
	import SmsStatusBanner from '$lib/components/app-shell/SmsStatusBanner.svelte';
	import Toaster from '$lib/components/shared/Toaster.svelte';
	import CommandPalette from '$lib/components/search/CommandPalette.svelte';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import { sessionStore, type AppSessionData } from '$lib/stores/session.svelte';
	import { notificationStore } from '$lib/stores/notifications.svelte';
	import { inboxUnreadStore } from '$lib/stores/inboxUnread.svelte';
	import type { RealtimeManager } from '$lib/stores/realtimeReconnect';
	import type { NotificationItem } from '$lib/notifications/navigation';

	let { data, children } = $props<{ data: { session: AppSessionData }; children: () => unknown }>();

	let moreOpen = $state(false);
	let setupBannerDismissed = $state(false);

	// Desktop sidebar collapse — persisted per browser. SSR renders expanded;
	// the browser guard prevents state leaking between server requests.
	const SIDEBAR_COLLAPSED_KEY = 'cos:sidebar-collapsed';
	let sidebarCollapsed = $state(browser && localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');

	function toggleSidebar() {
		sidebarCollapsed = !sidebarCollapsed;
		try {
			localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0');
		} catch {
			// storage unavailable (private mode) — collapse still works for the session
		}
	}

	function handleCmdK(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			commandPalette.open = !commandPalette.open;
		}
	}

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

	// supabase-js (~205 KB raw) is dynamically imported after mount so the shell
	// paints and hydrates without it on the critical path. Realtime notifications
	// connect a beat later — invisible to the user.
	let realtimeManager: RealtimeManager | null = null;
	let destroyed = false;

	onMount(() => {
		window.addEventListener('keydown', handleCmdK);
		lastFeatureOverridesUpdatedAt = toIso(session.org.feature_overrides_updated_at);
		pollHandle = setInterval(pollStatus, POLL_MS);

		// Register service worker for Web Push — permission is NOT requested here.
		// User initiates permission from Settings → Notifications.
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js').catch(() => {
				// SW registration failure is non-fatal
			});
		}

		// Skip CRM-side data + realtime entirely while suspended.
		if (session.org.status === 'suspended') return;

		void notificationStore.load(true);
		void inboxUnreadStore.load();
		const memberId = session.member.id;
		const orgId = session.member.org_id;
		void (async () => {
			// createRealtimeManager pulls in supabase-js; import it lazily so the shell
			// paints without it. It pushes the auth JWT before every subscribe — the
			// step the old raw .subscribe() skipped, which is why RLS silently dropped
			// every notification INSERT until a reload re-fetched over the API.
			const { createRealtimeManager } = await import('$lib/stores/realtimeReconnect');
			if (destroyed) return;
			notificationStore.onSubscribed();
			realtimeManager = createRealtimeManager({
				build: (supabase) =>
					supabase
						.channel(`app:member:${memberId}`)
						.on(
							'postgres_changes',
							{
								event: 'INSERT',
								schema: 'public',
								table: 'notifications',
								filter: `member_id=eq.${memberId}`
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
								filter: `member_id=eq.${memberId}`
							},
							(payload: { new: NotificationItem }) => {
								notificationStore.applyRealtimeUpdate(payload.new);
							}
						)
						.on(
							'postgres_changes',
							{
								event: 'INSERT',
								schema: 'public',
								table: 'messages',
								filter: `org_id=eq.${orgId}`
							},
							(payload: { new: { direction: string; is_internal_note: boolean } }) => {
								// Keep the sidebar Inbox badge live even off the inbox page. The
								// authoritative count is refetched (debounced) — only inbound,
								// non-note messages can change unread state.
								if (payload.new.direction === 'inbound' && !payload.new.is_internal_note) {
									inboxUnreadStore.scheduleRefresh();
								}
							}
						),
				onReconnect: () => {
					// Catch up on anything missed while the socket was down.
					void notificationStore.load(true);
					void inboxUnreadStore.load();
				}
			});
		})();

		// Pre-warm each main tab's route code while the browser is idle. A page only
		// freezes on click when its JS chunk still has to download + parse at that
		// moment; warming it ahead of time means a *direct* click (or a touch tap,
		// which has no hover) paints the shell + skeleton instantly. The hover-preload
		// in app.html only covers hover — this is the floor for sudden clicks. Code
		// only: per-page data still loads on navigation behind its own skeleton.
		const warmRoutes = () => {
			const hrefs = [...visibleNav.map((i) => i.href), '/settings'];
			for (const href of hrefs) void preloadCode(href).catch(() => {});
		};
		const ric = (
			window as unknown as {
				requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
			}
		).requestIdleCallback;
		if (ric) ric(warmRoutes, { timeout: 3000 });
		else setTimeout(warmRoutes, 1500);
	});
	onDestroy(() => {
		destroyed = true;
		window.removeEventListener('keydown', handleCmdK);
		if (pollHandle) clearInterval(pollHandle);
		realtimeManager?.destroy();
		realtimeManager = null;
	});

	const visibleNav = $derived(buildVisibleNav(session.member, session.featureFlags));
	const split = $derived(splitForMobile(visibleNav));
	const showSetupBanner = $derived(!session.org.is_setup_complete && !setupBannerDismissed);
	const isSuspended = $derived(session.org.status === 'suspended');
</script>

{#if isSuspended}
	<div class="app-shell app-shell--suspended">
		{@render children()}
		<Toaster />
	</div>
{:else}
	<div class="app-shell{sidebarCollapsed ? ' app-shell--nav-collapsed' : ''}">
		<DesktopSidebar
			items={visibleNav}
			member={session.member}
			org={session.org}
			collapsed={sidebarCollapsed}
			onToggle={toggleSidebar}
		/>
		<div class="app-shell__content">
			<div class="app-shell__topbar">
				<AppHeader org={session.org} member={session.member} />
			</div>
			{#if showSetupBanner}
				<SetupBanner onDismiss={() => (setupBannerDismissed = true)} />
			{/if}
			<SmsStatusBanner
				smsEnabled={session.org.sms_enabled}
				hasNumber={session.org.twilio_phone_number != null}
				approvalStatus={session.org.sms_approval_status}
				country={session.org.country}
				carrierComplete={session.org.country === 'US'
					? Boolean(
							session.org.legal_business_name &&
							session.org.ein &&
							session.org.website &&
							session.org.messaging_use_case
						)
					: session.org.country === 'CA'
						? Boolean(session.org.legal_business_name && session.org.business_number)
						: false}
			/>
			<main class="app-shell__main">
				{@render children()}
			</main>
		</div>
		<BottomNav
			primary={split.primary}
			hasSecondary={split.secondary.length > 0}
			onMoreClick={() => (moreOpen = true)}
		/>
		<MoreSheet bind:open={moreOpen} items={split.secondary} member={session.member} />
		<CommandPalette />
		<Toaster />
	</div>
{/if}

<style>
	main.app-shell__main {
		background-color: var(--color-bg-surface-sunk);
		padding-inline: 16px;
	}
</style>
