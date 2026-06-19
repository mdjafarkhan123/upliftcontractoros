<script lang="ts">
	import { onMount } from 'svelte';
	import type { Component } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { toast } from '$lib/stores/toast.svelte';
	import { cn } from '$lib/utils/cn';
	import {
		Bell,
		BellOff,
		BellRing,
		Smartphone,
		ChevronDown,
		CircleAlert,
		Mail,
		MessageSquare,
		Vibrate,
		Moon,
		Timer,
		Phone,
		Info,
		Check,
		Compass
	} from '@lucide/svelte';
	import { PUBLIC_VAPID_KEY } from '$env/static/public';
	import type { NotificationType } from '$lib/notifications/types';
	import { sessionStore } from '$lib/stores/session.svelte';
	import {
		STATUS_CLEAR_OPTIONS,
		effectiveStatus,
		type MemberNotificationStatus,
		type StatusClearAfter
	} from '$lib/notifications/memberStatus';
	import { MEMBER_STATUS_PRESETS } from '$lib/notifications/memberStatusPresets';

	type ChannelField = 'in_app_enabled' | 'push_enabled' | 'email_enabled' | 'sms_enabled';

	type PrefRow = {
		type: NotificationType;
		label: string;
		description: string;
		priority: string;
		default_visible: boolean;
		sms_eligible: boolean;
		in_app_enabled: boolean;
		push_enabled: boolean;
		email_enabled: boolean;
		sms_enabled: boolean;
	};

	type MemberSettings = {
		notification_phone: string | null;
		sms_notifications_allowed: boolean;
		email_notifications_allowed: boolean;
		personal_quiet_hours_enabled: boolean;
		personal_quiet_hours_start_hour: number | null;
		personal_quiet_hours_end_hour: number | null;
		escalation_minutes: number;
		notification_status: MemberNotificationStatus;
		notification_status_expires_at: string | null;
	};

	// Push subscription state
	type PushStatus = 'unknown' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

	let loading = $state(true);
	let saving = $state<Record<string, boolean>>({});
	let prefs = $state<PrefRow[]>([]);
	let settings = $state<MemberSettings | null>(null);
	let pushStatus = $state<PushStatus>('unknown');
	let subscribing = $state(false);
	let testingSend = $state(false);
	let advancedOpen = $state(false);

	// Phone number editing (own alert number)
	let phoneInput = $state('');
	let phoneError = $state<string | null>(null);
	let phoneSaving = $state(false);

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

	// Admin ceilings + phone-on-file gate the email/SMS chips so they mirror the resolver.
	const emailGated = $derived(settings ? !settings.email_notifications_allowed : false);
	const smsAdminGated = $derived(settings ? !settings.sms_notifications_allowed : false);
	const hasPhone = $derived(
		!!(settings?.notification_phone && settings.notification_phone.trim() !== '')
	);
	const anySmsEligible = $derived(prefs.some((p) => p.sms_eligible));

	const hours = Array.from({ length: 24 }, (_, i) => i);
	const escalationOptions = [2, 5, 10, 15, 30];

	// "My Status" quick-set (mirrors the avatar menu; same /api/me/status endpoint).
	let statusClearAfter = $state<StatusClearAfter>('none');
	let statusSaving = $state<MemberNotificationStatus | null>(null);
	const currentStatus = $derived(
		settings
			? effectiveStatus(settings.notification_status, settings.notification_status_expires_at)
			: 'in_office'
	);

	async function setStatus(status: MemberNotificationStatus) {
		if (!settings || statusSaving) return;
		statusSaving = status;
		try {
			const res = await fetch('/api/me/status', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					status,
					clear_after: status === 'in_office' ? 'none' : statusClearAfter
				})
			});
			if (!res.ok) throw new Error('failed');
			const body = (await res.json()) as {
				data: {
					notification_status: MemberNotificationStatus;
					notification_status_expires_at: string | null;
				};
			};
			settings.notification_status = body.data.notification_status;
			settings.notification_status_expires_at = body.data.notification_status_expires_at;
			// Keep the avatar dot in sync app-wide.
			const sess = sessionStore.data;
			if (sess) {
				sessionStore.update({
					...sess,
					member: {
						...sess.member,
						notification_status: body.data.notification_status,
						notification_status_expires_at: body.data.notification_status_expires_at
							? new Date(body.data.notification_status_expires_at)
							: null
					}
				});
			}
			statusClearAfter = 'none';
			const preset = MEMBER_STATUS_PRESETS.find((p) => p.value === status);
			toast.success(`Status set to ${preset?.label ?? status}`);
		} catch {
			toast.error('Could not update status');
		} finally {
			statusSaving = null;
		}
	}

	function formatHour(h: number): string {
		const ampm = h < 12 ? 'AM' : 'PM';
		const hr = h % 12 === 0 ? 12 : h % 12;
		return `${hr} ${ampm}`;
	}

	const phoneDirty = $derived((phoneInput.trim() || null) !== (settings?.notification_phone ?? null));

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
			const body = (await res.json()) as {
				data?: { preferences: PrefRow[]; settings: MemberSettings };
				error?: string;
			};
			if (body.data) {
				prefs = body.data.preferences;
				settings = body.data.settings;
				phoneInput = body.data.settings.notification_phone ?? '';
			}
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

	async function updatePref(type: NotificationType, field: ChannelField, value: boolean) {
		const idx = prefs.findIndex((p) => p.type === type);
		if (idx === -1) return;

		// If disabling in_app, also disable push (push rides on the in-app feed).
		const updates: Partial<PrefRow> = { [field]: value };
		if (field === 'in_app_enabled' && !value) updates.push_enabled = false;

		const prevRow = prefs[idx];
		prefs[idx] = { ...prevRow, ...updates };

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
			prefs[idx] = prevRow;
			toast.error('Failed to save preference');
		} finally {
			saving[key] = false;
		}
	}

	// PATCH a member-level settings change. Returns true on success.
	async function persistSettings(partial: Record<string, unknown>, key: string): Promise<boolean> {
		saving[key] = true;
		try {
			const res = await fetch('/api/settings/notifications', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ settings: partial })
			});
			if (!res.ok) {
				const body = (await res.json()) as { error?: string };
				throw new Error(body.error ?? 'Save failed');
			}
			return true;
		} catch {
			toast.error('Failed to save');
			return false;
		} finally {
			saving[key] = false;
		}
	}

	async function savePhone() {
		if (!settings || phoneSaving) return;
		phoneError = null;
		phoneSaving = true;
		try {
			const res = await fetch('/api/settings/notifications', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ settings: { notification_phone: phoneInput } })
			});
			if (res.status === 204) {
				const trimmed = phoneInput.trim();
				settings.notification_phone = trimmed === '' ? null : trimmed;
				toast.success(trimmed === '' ? 'Phone number removed' : 'Phone number saved');
			} else {
				const body = (await res.json()) as {
					error?: string;
					field_errors?: { notification_phone?: string };
				};
				phoneError = body.field_errors?.notification_phone ?? body.error ?? 'Could not save number';
			}
		} catch {
			phoneError = 'Could not save number';
		} finally {
			phoneSaving = false;
		}
	}

	async function toggleQuietHours(v: boolean) {
		if (!settings) return;
		const prev = {
			enabled: settings.personal_quiet_hours_enabled,
			start: settings.personal_quiet_hours_start_hour,
			end: settings.personal_quiet_hours_end_hour
		};
		// Seed sensible defaults the first time it's switched on.
		const start = v ? (prev.start ?? 22) : prev.start;
		const end = v ? (prev.end ?? 7) : prev.end;
		settings.personal_quiet_hours_enabled = v;
		settings.personal_quiet_hours_start_hour = start;
		settings.personal_quiet_hours_end_hour = end;
		const ok = await persistSettings(
			{
				personal_quiet_hours_enabled: v,
				personal_quiet_hours_start_hour: start ?? null,
				personal_quiet_hours_end_hour: end ?? null
			},
			'quiet'
		);
		if (!ok) {
			settings.personal_quiet_hours_enabled = prev.enabled;
			settings.personal_quiet_hours_start_hour = prev.start;
			settings.personal_quiet_hours_end_hour = prev.end;
		}
	}

	async function setQuietHour(which: 'start' | 'end', value: string) {
		if (!settings) return;
		const h = Number(value);
		const field =
			which === 'start' ? 'personal_quiet_hours_start_hour' : 'personal_quiet_hours_end_hour';
		const prev = settings[field];
		settings[field] = h;
		const ok = await persistSettings({ [field]: h }, 'quiet');
		if (!ok) settings[field] = prev;
	}

	async function setEscalation(value: string) {
		if (!settings) return;
		const m = Number(value);
		const prev = settings.escalation_minutes;
		settings.escalation_minutes = m;
		const ok = await persistSettings({ escalation_minutes: m }, 'escalation');
		if (!ok) settings.escalation_minutes = prev;
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
	subtitle="Choose what reaches you, where, and when."
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
			<!-- Section 0: My status -->
			{#if settings}
				<section class="flex flex-col gap-4">
					<div class="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
						<div class="mb-4 flex items-start gap-3">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-500/10"
							>
								<Compass class="h-5 w-5 text-violet-600 dark:text-violet-400" />
							</div>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-semibold text-foreground">My status</p>
								<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
									Sets how loudly alerts reach you right now. Also available from your avatar menu.
								</p>
							</div>
						</div>

						<div class="flex flex-col gap-1.5">
							{#each MEMBER_STATUS_PRESETS as preset (preset.value)}
								{@const Icon = preset.icon}
								{@const active = currentStatus === preset.value}
								<button
									type="button"
									onclick={() => setStatus(preset.value)}
									disabled={statusSaving !== null}
									aria-pressed={active}
									class={cn(
										'flex min-h-[52px] w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors',
										active
											? 'border-primary/40 bg-primary/5'
											: 'border-border/60 bg-card hover:bg-muted/30',
										statusSaving !== null && 'opacity-70'
									)}
								>
									<span class={cn('h-2.5 w-2.5 shrink-0 rounded-full', preset.dotClass)}></span>
									<Icon class={cn('h-4 w-4 shrink-0', preset.textClass)} />
									<span class="min-w-0 flex-1">
										<span class="block text-sm font-medium text-foreground">{preset.label}</span>
										<span class="block text-xs text-muted-foreground">{preset.description}</span>
									</span>
									{#if active}
										<Check class="h-4 w-4 shrink-0 text-primary" />
									{/if}
								</button>
							{/each}
						</div>

						<div class="mt-4">
							<Label class="text-xs text-muted-foreground">Clear after</Label>
							<div class="mt-1.5 flex flex-wrap gap-2">
								{#each STATUS_CLEAR_OPTIONS as opt (opt.value)}
									<button
										type="button"
										onclick={() => (statusClearAfter = opt.value)}
										aria-pressed={statusClearAfter === opt.value}
										class={cn(
											'min-h-[40px] rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
											statusClearAfter === opt.value
												? 'border-primary/40 bg-primary/10 text-primary'
												: 'border-border/60 text-muted-foreground hover:bg-muted/30'
										)}
									>
										{opt.label}
									</button>
								{/each}
							</div>
							<p class="mt-2 text-[11px] leading-relaxed text-muted-foreground/70">
								Applies to the next status you pick. In office never expires.
							</p>
						</div>
					</div>
				</section>
			{/if}

			<!-- Section A: This Phone (push) -->
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

			<!-- Section B: Your mobile number (notification_phone) -->
			<section class="flex flex-col gap-4">
				<div class="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
					<div class="mb-4 flex items-start gap-3">
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-500/10"
						>
							<Phone class="h-5 w-5 text-sky-600 dark:text-sky-400" />
						</div>
						<div class="flex-1 min-w-0">
							<p class="text-sm font-semibold text-foreground">Your mobile number</p>
							<p class="text-xs text-muted-foreground leading-relaxed mt-0.5">
								Where we text you when an urgent alert needs your attention.
							</p>
						</div>
					</div>

					<div class="flex flex-col gap-1.5">
						<Label for="notif-phone" class="text-xs text-muted-foreground">Mobile number</Label>
						<div class="flex gap-2">
							<Input
								id="notif-phone"
								type="tel"
								placeholder="+1 555 123 4567"
								bind:value={phoneInput}
								class="h-11 flex-1"
								aria-invalid={!!phoneError}
							/>
							<Button
								class="h-11 shrink-0"
								onclick={savePhone}
								disabled={phoneSaving || !phoneDirty}
							>
								{phoneSaving ? 'Saving…' : 'Save'}
							</Button>
						</div>
						{#if phoneError}
							<p class="text-xs text-destructive">{phoneError}</p>
						{:else}
							<p class="text-[11px] text-muted-foreground/70 leading-relaxed">
								Include your country code. Leave blank to stop receiving text alerts.
							</p>
						{/if}
					</div>
				</div>
			</section>

			<!-- Gating notices for email / SMS channels -->
			{#if emailGated || smsAdminGated || (anySmsEligible && !hasPhone)}
				<div class="flex flex-col gap-2">
					{#if emailGated}
						{@render gateNote('Email alerts are turned off for your account by an admin.')}
					{/if}
					{#if smsAdminGated}
						{@render gateNote('Text alerts are turned off for your account by an admin.')}
					{:else if anySmsEligible && !hasPhone}
						{@render gateNote('Add your mobile number above to receive text alerts.')}
					{/if}
				</div>
			{/if}

			<!-- Section C: Default preferences (4-channel matrix) -->
			{#if visibleCritical.length > 0 || visibleHigh.length > 0}
				<section class="flex flex-col gap-3">
					<p class="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
						Default alerts
					</p>
					<div class="flex flex-col gap-1.5">
						{#if visibleCritical.length > 0}
							<div class="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
								<div
									class="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20"
								>
									<span class="h-2 w-2 rounded-full bg-red-500 shrink-0"></span>
									<p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
										Critical
									</p>
								</div>
								{#each visibleCritical as pref, i (pref.type)}
									{@render prefRow(pref, i < visibleCritical.length - 1)}
								{/each}
							</div>
						{/if}

						{#if visibleHigh.length > 0}
							<div class="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
								<div
									class="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20"
								>
									<span class="h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>
									<p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
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

			<!-- Section D: Advanced matrix -->
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

			<!-- Section E: Quiet hours -->
			{#if settings}
				<section class="flex flex-col gap-3">
					<p class="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
						Timing
					</p>
					<div class="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
						<div class="flex items-start gap-3">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-500/10"
							>
								<Moon class="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-semibold text-foreground">Quiet hours</p>
								<p class="text-xs text-muted-foreground leading-relaxed mt-0.5">
									Mute email and text alerts overnight. The most urgent alerts still break through.
								</p>
							</div>
							<Switch
								checked={settings.personal_quiet_hours_enabled}
								onchange={(v) => toggleQuietHours(v)}
								aria-label="Enable quiet hours"
							/>
						</div>

						{#if settings.personal_quiet_hours_enabled}
							<div class="mt-4 grid grid-cols-2 gap-3">
								<div class="flex flex-col gap-1.5">
									<Label class="text-xs text-muted-foreground">From</Label>
									<Select.Root
										value={String(settings.personal_quiet_hours_start_hour ?? 22)}
										onValueChange={(v) => setQuietHour('start', v)}
									>
										<Select.Trigger class="h-11 w-full">
											{formatHour(settings.personal_quiet_hours_start_hour ?? 22)}
										</Select.Trigger>
										<Select.Content>
											{#each hours as h (h)}
												<Select.Item value={String(h)}>{formatHour(h)}</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
								</div>
								<div class="flex flex-col gap-1.5">
									<Label class="text-xs text-muted-foreground">To</Label>
									<Select.Root
										value={String(settings.personal_quiet_hours_end_hour ?? 7)}
										onValueChange={(v) => setQuietHour('end', v)}
									>
										<Select.Trigger class="h-11 w-full">
											{formatHour(settings.personal_quiet_hours_end_hour ?? 7)}
										</Select.Trigger>
										<Select.Content>
											{#each hours as h (h)}
												<Select.Item value={String(h)}>{formatHour(h)}</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
								</div>
							</div>
						{/if}
					</div>

					<!-- Section F: Escalation -->
					<div class="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
						<div class="flex items-start gap-3">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/10"
							>
								<Timer class="h-5 w-5 text-rose-600 dark:text-rose-400" />
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-semibold text-foreground">Escalation</p>
								<p class="text-xs text-muted-foreground leading-relaxed mt-0.5">
									If an urgent alert sits unread, we'll re-ping you louder after this long.
								</p>
							</div>
						</div>
						<div class="mt-4 max-w-[200px]">
							<Select.Root
								value={String(settings.escalation_minutes)}
								onValueChange={(v) => setEscalation(v)}
							>
								<Select.Trigger class="h-11 w-full">
									{settings.escalation_minutes} minutes
								</Select.Trigger>
								<Select.Content>
									{#each escalationOptions as m (m)}
										<Select.Item value={String(m)}>{m} minutes</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					</div>
				</section>
			{/if}
		</div>
	{/if}
</PageWrapper>

{#snippet gateNote(text: string)}
	<div class="flex items-start gap-2 rounded-xl bg-muted/40 px-3.5 py-2.5">
		<Info class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
		<p class="text-xs text-muted-foreground leading-relaxed">{text}</p>
	</div>
{/snippet}

{#snippet channelChip(
	pref: PrefRow,
	field: ChannelField,
	Icon: Component,
	label: string,
	disabled: boolean
)}
	{@const on = pref[field]}
	<button
		type="button"
		{disabled}
		onclick={() => updatePref(pref.type, field, !on)}
		aria-pressed={on}
		aria-label={`${label} for ${pref.label}`}
		class={cn(
			'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium min-h-[40px] transition-colors duration-150',
			disabled
				? 'border-border/40 bg-muted/20 text-muted-foreground/40 cursor-not-allowed'
				: on
					? 'border-primary/40 bg-primary/10 text-primary'
					: 'border-border/60 bg-card text-muted-foreground hover:border-border hover:bg-muted/30'
		)}
	>
		<Icon class="h-3.5 w-3.5" />
		{label}
	</button>
{/snippet}

{#snippet prefRow(pref: PrefRow, divider: boolean)}
	<div class={cn('flex flex-col gap-2.5 px-4 py-3.5', divider && 'border-b border-border/40')}>
		<div class="min-w-0">
			<p class="text-sm font-medium text-foreground leading-snug">{pref.label}</p>
			<p class="text-xs text-muted-foreground leading-snug mt-0.5">{pref.description}</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{@render channelChip(pref, 'in_app_enabled', Bell, 'App', false)}
			{@render channelChip(pref, 'push_enabled', Vibrate, 'Buzz', !pref.in_app_enabled)}
			{@render channelChip(pref, 'email_enabled', Mail, 'Email', emailGated)}
			{#if pref.sms_eligible}
				{@render channelChip(
					pref,
					'sms_enabled',
					MessageSquare,
					'Text',
					smsAdminGated || !hasPhone
				)}
			{/if}
		</div>
	</div>
{/snippet}
