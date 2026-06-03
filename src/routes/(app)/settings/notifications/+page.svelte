<script lang="ts">
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';
	import { cn } from '$lib/utils/cn';
	import { Bell, BellOff, BellRing, Smartphone, ChevronDown, CircleAlert } from '@lucide/svelte';
	import { PUBLIC_VAPID_KEY } from '$env/static/public';
	import { NOTIFICATION_SPEC } from '$lib/notifications/spec';
	import { NOTIFICATION_TYPES } from '$lib/notifications/types';
	import type { NotificationType } from '$lib/notifications/types';

	type PrefRow = {
		type: NotificationType;
		label: string;
		description: string;
		priority: string;
		default_visible: boolean;
		in_app_enabled: boolean;
		push_enabled: boolean;
	};

	// Push subscription state
	type PushStatus = 'unknown' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

	let loading = $state(true);
	let saving = $state<Record<string, boolean>>({});
	let prefs = $state<PrefRow[]>([]);
	let pushStatus = $state<PushStatus>('unknown');
	let subscribing = $state(false);
	let testingSend = $state(false);
	let advancedOpen = $state(false);

	const visiblePrefs = $derived(prefs.filter((p) => p.default_visible));
	const advancedPrefs = $derived(prefs.filter((p) => !p.default_visible));

	const criticalTypes: NotificationType[] = [
		'new_lead',
		'message_received',
		'missed_call_handled',
		'appointment_no_show',
		'appointment_cancelled',
		'appointment_rescheduled'
	];
	const highTypes: NotificationType[] = ['quote_viewed', 'quote_accepted', 'payment_received'];

	const visibleCritical = $derived(visiblePrefs.filter((p) => criticalTypes.includes(p.type)));
	const visibleHigh = $derived(visiblePrefs.filter((p) => highTypes.includes(p.type)));

	// iOS Safari non-standalone detection
	const isIosSafariNotInstalled = $derived.by(() => {
		if (typeof navigator === 'undefined') return false;
		const ua = navigator.userAgent;
		const isIos = /iPad|iPhone|iPod/.test(ua);
		const isStandalone = (navigator as { standalone?: boolean }).standalone === true;
		return isIos && !isStandalone;
	});

	onMount(async () => {
		await load();
		await checkPushStatus();
	});

	async function load() {
		loading = true;
		try {
			const res = await fetch('/api/settings/notifications');
			const body = (await res.json()) as { data?: PrefRow[]; error?: string };
			if (body.data) prefs = body.data;
		} catch {
			toast.error('Failed to load notification preferences');
		} finally {
			loading = false;
		}
	}

	async function checkPushStatus() {
		if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
			pushStatus = 'unsupported';
			return;
		}
		const permission = Notification.permission;
		if (permission === 'denied') {
			pushStatus = 'denied';
			return;
		}
		try {
			const reg = await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.getSubscription();
			pushStatus = sub ? 'subscribed' : 'unsubscribed';
		} catch {
			pushStatus = 'unsubscribed';
		}
	}

	async function subscribeToPush() {
		if (subscribing) return;
		subscribing = true;
		try {
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				pushStatus = 'denied';
				toast.error('Notification permission denied. Enable it in your browser settings.');
				return;
			}
			if (!PUBLIC_VAPID_KEY) {
				toast.error('Push notifications are not configured for this environment.');
				return;
			}
			const reg = await navigator.serviceWorker.ready;
			const existing = await reg.pushManager.getSubscription();
			if (existing) {
				try {
					await existing.unsubscribe();
				} catch {
					// ignore — subscribe below will surface the real error
				}
			}
			const sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY).buffer as ArrayBuffer
			});
			const subJson = sub.toJSON();
			await fetch('/api/push/subscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					endpoint: sub.endpoint,
					p256dh: subJson.keys?.p256dh ?? '',
					auth: subJson.keys?.auth ?? '',
					user_agent: navigator.userAgent.slice(0, 200)
				})
			});
			pushStatus = 'subscribed';
			toast.success('Buzz enabled for this phone');
		} catch (err) {
			console.error('[push] subscribe failed:', err);
			toast.error('Could not enable buzz. Try again.');
		} finally {
			subscribing = false;
		}
	}

	async function sendTestBuzz() {
		if (testingSend) return;
		testingSend = true;
		try {
			const res = await fetch('/api/push/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			const body = (await res.json()) as { data?: { sent: number }; error?: string };
			if (body.error) {
				toast.error(body.error);
			} else {
				toast.success('Test buzz sent — check your notifications');
			}
		} catch {
			toast.error('Failed to send test buzz');
		} finally {
			testingSend = false;
		}
	}

	async function updatePref(
		type: NotificationType,
		field: 'in_app_enabled' | 'push_enabled',
		value: boolean
	) {
		const idx = prefs.findIndex((p) => p.type === type);
		if (idx === -1) return;

		// If disabling in_app, also disable push
		const updates: Partial<PrefRow> = { [field]: value };
		if (field === 'in_app_enabled' && !value) updates.push_enabled = false;

		// Optimistic update
		prefs[idx] = { ...prefs[idx], ...updates };

		const key = `${type}:${field}`;
		saving[key] = true;
		try {
			const res = await fetch('/api/settings/notifications', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ preferences: [{ type, ...updates }] })
			});
			if (!res.ok) {
				const body = (await res.json()) as { error?: string };
				throw new Error(body.error ?? 'Save failed');
			}
		} catch {
			// Revert on error
			prefs[idx] = { ...prefs[idx], [field]: !value };
			toast.error('Failed to save preference');
		} finally {
			saving[key] = false;
		}
	}

	function urlBase64ToUint8Array(base64String: string): Uint8Array {
		const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
		const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
		const rawData = atob(base64);
		return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
	}
</script>

<svelte:head>
	<title>Notifications · Settings</title>
</svelte:head>

<PageWrapper
	title="Notifications"
	subtitle="Choose what buzzes your phone and shows in your feed."
	back="/settings"
>
	{#if loading}
		<div class="flex flex-col gap-4">
			<div class="h-32 w-full rounded-2xl overflow-hidden"><SkeletonLoader lines={3} /></div>
			<div class="h-64 w-full rounded-2xl overflow-hidden"><SkeletonLoader lines={5} /></div>
			<div class="h-48 w-full rounded-2xl overflow-hidden"><SkeletonLoader lines={4} /></div>
		</div>
	{:else}
		<div class="flex flex-col gap-6 pb-10">
			<!-- Section A: This Phone -->
			<section class="flex flex-col gap-4">
				<div class="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
					<div class="mb-4 flex items-start gap-3">
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-500/10"
						>
							<Smartphone class="h-5 w-5 text-amber-600 dark:text-amber-400" />
						</div>
						<div class="flex-1 min-w-0">
							<p class="text-sm font-semibold text-foreground">This phone</p>
							<p class="text-xs text-muted-foreground leading-relaxed mt-0.5">
								Buzz your phone the moment something important happens — even when the app is
								closed.
							</p>
						</div>
						<!-- Status chip -->
						<div
							class={cn(
								'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium shrink-0',
								pushStatus === 'subscribed'
									? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
									: pushStatus === 'denied'
										? 'bg-destructive/10 text-destructive'
										: pushStatus === 'unsupported'
											? 'bg-muted text-muted-foreground'
											: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-500'
							)}
						>
							{#if pushStatus === 'subscribed'}
								<BellRing class="h-3 w-3" />
								Buzz is on
							{:else if pushStatus === 'denied'}
								<BellOff class="h-3 w-3" />
								Buzz blocked
							{:else if pushStatus === 'unsupported'}
								<BellOff class="h-3 w-3" />
								Not supported
							{:else}
								<Bell class="h-3 w-3" />
								Buzz is off
							{/if}
						</div>
					</div>

					<!-- iOS hint -->
					{#if isIosSafariNotInstalled}
						<div
							class="mb-4 flex items-start gap-2 rounded-xl bg-blue-50 px-3.5 py-3 dark:bg-blue-500/10"
						>
							<CircleAlert class="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
							<p class="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
								On iPhone, tap <strong>Share → Add to Home Screen</strong>, then open from your Home
								Screen so buzz can reach you.
							</p>
						</div>
					{/if}

					<div class="flex flex-col gap-3">
						{#if pushStatus === 'subscribed'}
							<Button
								variant="outline"
								class="w-full min-h-[44px] gap-2"
								onclick={sendTestBuzz}
								disabled={testingSend}
							>
								<BellRing class="h-4 w-4" />
								{testingSend ? 'Sending…' : 'Send me a test buzz'}
							</Button>
						{:else if pushStatus === 'denied'}
							<div
								class="rounded-xl bg-destructive/5 px-4 py-3 text-xs text-destructive leading-relaxed"
							>
								Buzz is blocked for this browser. Go to your browser settings and allow
								notifications for this site, then reload.
							</div>
						{:else if pushStatus !== 'unsupported'}
							<Button
								class="w-full min-h-[44px] gap-2 bg-amber-500 hover:bg-amber-600 text-white"
								onclick={subscribeToPush}
								disabled={subscribing}
							>
								<BellRing class="h-4 w-4" />
								{subscribing ? 'Setting up…' : 'Buzz this phone when it happens'}
							</Button>
						{:else}
							<div
								class="rounded-xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground leading-relaxed"
							>
								Your browser doesn't support push notifications. Try Chrome or Edge for buzz
								support.
							</div>
						{/if}
					</div>

					<p class="mt-3 text-[11px] text-muted-foreground/70 leading-relaxed">
						Sounds play when the app is open. When it's closed, your phone uses its normal
						notification tone.
					</p>
				</div>
			</section>

			<!-- Section B: Default preferences -->
			{#if visibleCritical.length > 0 || visibleHigh.length > 0}
				<section class="flex flex-col gap-3">
					<p class="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
						Default alerts
					</p>
					<div class="flex flex-col gap-1.5">
						{#if visibleCritical.length > 0}
							<!-- Critical group -->
							<div class="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
								<div
									class="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20"
								>
									<span class="h-2 w-2 rounded-full bg-red-500 shrink-0"></span>
									<p
										class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
									>
										Critical
									</p>
								</div>
								{#each visibleCritical as pref, i (pref.type)}
									{@render prefRow(pref, i < visibleCritical.length - 1)}
								{/each}
							</div>
						{/if}

						{#if visibleHigh.length > 0}
							<!-- High / Wins group -->
							<div class="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
								<div
									class="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20"
								>
									<span class="h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>
									<p
										class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
									>
										Wins
									</p>
								</div>
								{#each visibleHigh as pref, i (pref.type)}
									{@render prefRow(pref, i < visibleHigh.length - 1)}
								{/each}
							</div>
						{/if}
					</div>
				</section>
			{/if}

			<!-- Section C: Advanced -->
			{#if advancedPrefs.length > 0}
				<section class="flex flex-col gap-3">
					<button
						class="flex w-full items-center justify-between px-1 py-0.5 group"
						onclick={() => (advancedOpen = !advancedOpen)}
					>
						<p
							class="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 group-hover:text-muted-foreground transition-colors duration-150"
						>
							Advanced
						</p>
						<ChevronDown
							class={cn(
								'h-4 w-4 text-muted-foreground/50 transition-transform duration-200',
								advancedOpen && 'rotate-180'
							)}
						/>
					</button>

					{#if advancedOpen}
						<div class="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
							{#each advancedPrefs as pref, i (pref.type)}
								{@render prefRow(pref, i < advancedPrefs.length - 1)}
							{/each}
						</div>
					{/if}
				</section>
			{/if}
		</div>
	{/if}
</PageWrapper>

{#snippet prefRow(pref: PrefRow, divider: boolean)}
	<div
		class={cn(
			'flex items-center gap-3 px-4 py-3.5 min-h-[68px]',
			divider && 'border-b border-border/40'
		)}
	>
		<div class="flex-1 min-w-0">
			<p class="text-sm font-medium text-foreground leading-snug">{pref.label}</p>
			<p class="text-xs text-muted-foreground leading-snug mt-0.5 truncate">{pref.description}</p>
		</div>
		<div class="flex items-center gap-4 shrink-0">
			<!-- Show in app -->
			<div class="flex flex-col items-center gap-1">
				<Switch
					checked={pref.in_app_enabled}
					onchange={(v) => updatePref(pref.type, 'in_app_enabled', v)}
					class="scale-90"
					aria-label={`Show ${pref.label} in app`}
				/>
				<span class="text-[10px] text-muted-foreground/60">In app</span>
			</div>
			<!-- Buzz my phone -->
			<div class="flex flex-col items-center gap-1">
				<Switch
					checked={pref.push_enabled}
					disabled={!pref.in_app_enabled}
					onchange={(v) => updatePref(pref.type, 'push_enabled', v)}
					class="scale-90"
					aria-label={`Buzz phone for ${pref.label}`}
				/>
				<span
					class={cn(
						'text-[10px]',
						!pref.in_app_enabled ? 'text-muted-foreground/30' : 'text-muted-foreground/60'
					)}
				>
					Buzz
				</span>
			</div>
		</div>
	</div>
{/snippet}
