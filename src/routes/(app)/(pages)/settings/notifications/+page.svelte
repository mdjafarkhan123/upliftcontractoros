<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import PhoneField from '$lib/components/shared/PhoneField.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { getOrgContext } from '$lib/context/org';
	import { Switch } from '$lib/components/ui/switch';
	import * as Select from '$lib/components/ui/select';
	import { toast } from '$lib/stores/toast.svelte';
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

	const org = getOrgContext();
	const orgCountry = $derived(org().country ?? 'US');

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

	const phoneDirty = $derived(
		(phoneInput.trim() || null) !== (settings?.notification_phone ?? null)
	);

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
		<div class="notif notif--skeletons">
			<div class="notif__skeleton"><SkeletonLoader lines={3} /></div>
			<div class="notif__skeleton"><SkeletonLoader lines={5} /></div>
			<div class="notif__skeleton"><SkeletonLoader lines={4} /></div>
		</div>
	{:else}
		<div class="notif">
			<!-- Section 0: My status -->
			{#if settings}
				<section class="notif-card">
					<div class="notif-card__head">
						<div class="notif-tile notif-tile--violet">
							<i class="ri-compass-3-line" aria-hidden="true"></i>
						</div>
						<div class="notif-card__head-text">
							<p class="notif-card__title">My status</p>
							<p class="notif-card__desc">
								Sets how loudly alerts reach you right now. Also available from your avatar menu.
							</p>
						</div>
					</div>

					<div class="notif-statuses">
						{#each MEMBER_STATUS_PRESETS as preset (preset.value)}
							{@const active = currentStatus === preset.value}
							<button
								type="button"
								class="notif-statuses__item"
								class:notif-statuses__item--active={active}
								onclick={() => setStatus(preset.value)}
								disabled={statusSaving !== null}
								aria-pressed={active}
							>
								<span class="notif-statuses__dot" style="background:{preset.dotColor}"></span>
								<i
									class="notif-statuses__icon {preset.iconClass}"
									style="color:{preset.textColor}"
									aria-hidden="true"
								></i>
								<span class="notif-statuses__text">
									<span class="notif-statuses__name">{preset.label}</span>
									<span class="notif-statuses__desc">{preset.description}</span>
								</span>
								{#if active}
									<i class="notif-statuses__check ri-check-line" aria-hidden="true"></i>
								{/if}
							</button>
						{/each}
					</div>

					<div class="notif-clear">
						<span class="notif-clear__label">Clear after</span>
						<div class="notif-clear__chips">
							{#each STATUS_CLEAR_OPTIONS as opt (opt.value)}
								<button
									type="button"
									class="notif-clear__chip"
									class:notif-clear__chip--active={statusClearAfter === opt.value}
									onclick={() => (statusClearAfter = opt.value)}
									aria-pressed={statusClearAfter === opt.value}
								>
									{opt.label}
								</button>
							{/each}
						</div>
						<p class="notif-clear__note">
							Applies to the next status you pick. In office never expires.
						</p>
					</div>
				</section>
			{/if}

			<!-- Section A: This Phone (push) -->
			<section class="notif-card">
				<div class="notif-card__head">
					<div class="notif-tile notif-tile--amber">
						<i class="ri-smartphone-line" aria-hidden="true"></i>
					</div>
					<div class="notif-card__head-text">
						<p class="notif-card__title">This phone</p>
						<p class="notif-card__desc">
							Buzz your phone the moment something important happens — even when the app is closed.
						</p>
					</div>
					<div
						class="notif-chip notif-chip--{pushStatus === 'subscribed'
							? 'on'
							: pushStatus === 'denied'
								? 'blocked'
								: pushStatus === 'unsupported'
									? 'muted'
									: 'off'}"
					>
						{#if pushStatus === 'subscribed'}
							<i class="ri-notification-3-line" aria-hidden="true"></i>
							Buzz is on
						{:else if pushStatus === 'denied'}
							<i class="ri-notification-off-line" aria-hidden="true"></i>
							Buzz blocked
						{:else if pushStatus === 'unsupported'}
							<i class="ri-notification-off-line" aria-hidden="true"></i>
							Not supported
						{:else}
							<i class="ri-notification-line" aria-hidden="true"></i>
							Buzz is off
						{/if}
					</div>
				</div>

				{#if isIosSafariNotInstalled}
					<div class="notif-msg notif-msg--info" style="margin-bottom: 1rem;">
						<i class="ri-error-warning-line" aria-hidden="true"></i>
						<p>
							On iPhone, tap <strong>Share → Add to Home Screen</strong>, then open from your Home
							Screen so buzz can reach you.
						</p>
					</div>
				{/if}

				<div class="notif-card__actions">
					{#if pushStatus === 'subscribed'}
						<Button variant="outline" class="btn--full" loading={testingSend} loadingLabel="Sending…" onclick={sendTestBuzz}>
							<i class="ri-notification-3-line" aria-hidden="true"></i>
							Send me a test buzz
						</Button>
					{:else if pushStatus === 'denied'}
						<div class="notif-msg notif-msg--danger">
							<p>
								Buzz is blocked for this browser. Go to your browser settings and allow
								notifications for this site, then reload.
							</p>
						</div>
					{:else if pushStatus !== 'unsupported'}
						<Button class="btn--full" loading={subscribing} loadingLabel="Setting up…" onclick={subscribeToPush}>
							<i class="ri-notification-3-line" aria-hidden="true"></i>
							Buzz this phone when it happens
						</Button>
					{:else}
						<div class="notif-msg notif-msg--muted">
							<p>
								Your browser doesn't support push notifications. Try Chrome or Edge for buzz
								support.
							</p>
						</div>
					{/if}
				</div>

				<p class="notif-card__hint">
					Sounds play when the app is open. When it's closed, your phone uses its normal
					notification tone.
				</p>
			</section>

			<!-- Section B: Your mobile number (notification_phone) -->
			<section class="notif-card">
				<div class="notif-card__head">
					<div class="notif-tile notif-tile--sky">
						<i class="ri-phone-line" aria-hidden="true"></i>
					</div>
					<div class="notif-card__head-text">
						<p class="notif-card__title">Your mobile number</p>
						<p class="notif-card__desc">
							Where we text you when an urgent alert needs your attention.
						</p>
					</div>
				</div>

				<div class="field">
					<label class="field__label" for="notif-phone">Mobile number</label>
					<div class="notif-phone">
						<PhoneField
							id="notif-phone"
							bind:value={phoneInput}
							defaultCountry={orgCountry}
							invalid={!!phoneError}
						/>
						<Button disabled={!phoneDirty} loading={phoneSaving} loadingLabel="Saving…" onclick={savePhone}>
							Save
						</Button>
					</div>
					{#if phoneError}
						<p class="field__error">{phoneError}</p>
					{:else}
						<p class="field__hint">
							Include your country code. Leave blank to stop receiving text alerts.
						</p>
					{/if}
				</div>
			</section>

			<!-- Gating notices for email / SMS channels -->
			{#if emailGated || smsAdminGated || (anySmsEligible && !hasPhone)}
				<div class="notif__gates">
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
				<section class="notif__group">
					<p class="notif-eyebrow">Default alerts</p>
					<div class="notif__matrices">
						{#if visibleCritical.length > 0}
							<div class="notif-prefs">
								<div class="notif-prefs__group-head">
									<span class="notif-prefs__group-dot notif-prefs__group-dot--critical"></span>
									<p class="notif-prefs__group-label">Critical</p>
								</div>
								{#each visibleCritical as pref, i (pref.type)}
									{@render prefRow(pref, i < visibleCritical.length - 1)}
								{/each}
							</div>
						{/if}

						{#if visibleHigh.length > 0}
							<div class="notif-prefs">
								<div class="notif-prefs__group-head">
									<span class="notif-prefs__group-dot notif-prefs__group-dot--wins"></span>
									<p class="notif-prefs__group-label">Wins</p>
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
				<section class="notif__group">
					<button
						class="notif-advanced"
						class:notif-advanced--open={advancedOpen}
						onclick={() => (advancedOpen = !advancedOpen)}
					>
						<p class="notif-eyebrow">Advanced</p>
						<i class="notif-advanced__chevron ri-arrow-down-s-line" aria-hidden="true"></i>
					</button>

					{#if advancedOpen}
						<div class="notif-prefs">
							{#each advancedPrefs as pref, i (pref.type)}
								{@render prefRow(pref, i < advancedPrefs.length - 1)}
							{/each}
						</div>
					{/if}
				</section>
			{/if}

			<!-- Section E: Quiet hours -->
			{#if settings}
				<section class="notif__group">
					<p class="notif-eyebrow">Timing</p>
					<div class="notif-card">
						<div class="notif-card__head" style="margin-bottom: 0;">
							<div class="notif-tile notif-tile--indigo">
								<i class="ri-moon-line" aria-hidden="true"></i>
							</div>
							<div class="notif-card__head-text">
								<p class="notif-card__title">Quiet hours</p>
								<p class="notif-card__desc">
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
							<div class="notif-times">
								<div class="field">
									<span class="field__label">From</span>
									<Select.Root
										value={String(settings.personal_quiet_hours_start_hour ?? 22)}
										onValueChange={(v) => setQuietHour('start', v)}
									>
										<Select.Trigger>
											{formatHour(settings.personal_quiet_hours_start_hour ?? 22)}
										</Select.Trigger>
										<Select.Content>
											{#each hours as h (h)}
												<Select.Item value={String(h)}>{formatHour(h)}</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
								</div>
								<div class="field">
									<span class="field__label">To</span>
									<Select.Root
										value={String(settings.personal_quiet_hours_end_hour ?? 7)}
										onValueChange={(v) => setQuietHour('end', v)}
									>
										<Select.Trigger>
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
					<div class="notif-card">
						<div class="notif-card__head" style="margin-bottom: 0;">
							<div class="notif-tile notif-tile--rose">
								<i class="ri-timer-line" aria-hidden="true"></i>
							</div>
							<div class="notif-card__head-text">
								<p class="notif-card__title">Escalation</p>
								<p class="notif-card__desc">
									If an urgent alert sits unread, we'll re-ping you louder after this long.
								</p>
							</div>
						</div>
						<div class="notif-escalation">
							<Select.Root
								value={String(settings.escalation_minutes)}
								onValueChange={(v) => setEscalation(v)}
							>
								<Select.Trigger>
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
	<div class="settings-note">
		<i class="settings-note__icon ri-information-line" aria-hidden="true"></i>
		<p class="settings-note__text">{text}</p>
	</div>
{/snippet}

{#snippet channelChip(
	pref: PrefRow,
	field: ChannelField,
	icon: string,
	label: string,
	disabled: boolean
)}
	{@const on = pref[field]}
	<button
		type="button"
		class="notif-channel"
		class:notif-channel--on={on && !disabled}
		{disabled}
		onclick={() => updatePref(pref.type, field, !on)}
		aria-pressed={on}
		aria-label={`${label} for ${pref.label}`}
	>
		<i class={icon} aria-hidden="true"></i>
		{label}
	</button>
{/snippet}

{#snippet prefRow(pref: PrefRow, divider: boolean)}
	<div class="notif-pref" class:notif-pref--divided={divider}>
		<div>
			<p class="notif-pref__label">{pref.label}</p>
			<p class="notif-pref__desc">{pref.description}</p>
		</div>
		<div class="notif-pref__chips">
			{@render channelChip(pref, 'in_app_enabled', 'ri-notification-3-line', 'App', false)}
			{@render channelChip(pref, 'push_enabled', 'ri-vibrate-line', 'Buzz', !pref.in_app_enabled)}
			{@render channelChip(pref, 'email_enabled', 'ri-mail-line', 'Email', emailGated)}
			{#if pref.sms_eligible}
				{@render channelChip(
					pref,
					'sms_enabled',
					'ri-message-2-line',
					'Text',
					smsAdminGated || !hasPhone
				)}
			{/if}
		</div>
	</div>
{/snippet}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.notif {
		display: flex;
		flex-direction: column;
		gap: $space-6;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(600px, 1fr));
		padding-bottom: $space-10;

		&--skeletons {
			gap: $space-4;
		}

		&__skeleton {
			border-radius: $radius-xl;
			overflow: hidden;
		}

		&__gates {
			display: flex;
			flex-direction: column;
			gap: $space-2;
		}

		&__group {
			display: flex;
			flex-direction: column;
			gap: $space-3;
		}

		&__matrices {
			display: flex;
			flex-direction: column;
			gap: $space-2;
		}
	}
</style>
