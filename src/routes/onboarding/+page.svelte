<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Loader2, Check } from '@lucide/svelte';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import AuthAlert from '$lib/components/auth/AuthAlert.svelte';
	import * as Select from '$lib/components/ui/select';
	import * as Popover from '$lib/components/ui/popover';
	import TimezoneCombobox from '$lib/components/shared/TimezoneCombobox.svelte';
	import {
		COUNTRY_OPTIONS,
		countryName,
		isSmsSupportedCountry,
		smsCountrySupport
	} from '$lib/utils/countries';
	import { cn } from '$lib/utils/cn';

	type Phase = 'loading' | 'password' | 'business' | 'phone' | 'carrier' | 'branding';

	let phase = $state<Phase>('loading');
	let smsEnabled = $state(true);

	// Step 1 — password
	let password = $state('');
	let confirmPassword = $state('');

	// Step 2 — business profile (prefilled from /api/onboarding/state)
	let bizName = $state('');
	let tradeType = $state('');
	let country = $state('');
	let timezone = $state('');
	let address = $state('');
	let city = $state('');
	let stateRegion = $state('');
	let zip = $state('');

	// Step 3 — phone setup (only when sms_enabled)
	type AvailableNumber = {
		phoneNumber: string;
		friendlyName: string;
		locality: string | null;
		region: string | null;
	};
	let postalCode = $state('');
	let searching = $state(false);
	let numbers = $state<AvailableNumber[]>([]);
	let searched = $state(false);
	let selectedNumber = $state('');
	// Whether the org has a business number (drives the carrier step). Set from
	// /api/onboarding/state and flipped true after a successful purchase.
	let hasNumber = $state(false);

	// Step 4 — carrier approval (only US/CA orgs with a number). Skippable.
	let legalBusinessName = $state('');
	let ein = $state('');
	let website = $state('');
	let messagingUseCase = $state('');
	let businessNumber = $state('');

	// Step 5 — branding (prefilled from /api/onboarding/state). Skippable.
	let primaryColor = $state('');
	let dayStart = $state(7);
	let dayEnd = $state(19);

	const SWATCHES = [
		'#ef4444',
		'#f97316',
		'#f59e0b',
		'#eab308',
		'#84cc16',
		'#22c55e',
		'#10b981',
		'#14b8a6',
		'#06b6d4',
		'#0ea5e9',
		'#3b82f6',
		'#6366f1',
		'#8b5cf6',
		'#a855f7',
		'#d946ef',
		'#ec4899',
		'#f43f5e',
		'#64748b',
		'#475569',
		'#0f172a'
	];

	const HOUR_OPTIONS = Array.from({ length: 25 }, (_, h) => ({
		value: h,
		label:
			h === 0
				? '12:00 AM'
				: h < 12
					? `${h}:00 AM`
					: h === 12
						? '12:00 PM'
						: h === 24
							? '12:00 AM (next day)'
							: `${h - 12}:00 PM`
	}));

	let submitting = $state(false);
	let formError = $state<string | null>(null);
	let fieldErrors = $state<Record<string, string>>({});

	// The phone step (Step 3) applies only when SMS is enabled AND the chosen
	// country is an SMS-supported market (Onboarding.md Part 9). An unsupported
	// region skips straight from business profile to branding.
	const phoneStepApplies = $derived(smsEnabled && isSmsSupportedCountry(country));

	// Carrier Approval (Step 4) applies only to gated markets (US 10DLC / CA CWTA).
	// The label shows for those countries; the interactive phase is reached only
	// after a number is purchased (skipping the number skips carrier entirely).
	const carrierStepApplies = $derived(smsEnabled && smsCountrySupport(country) === 'gated');

	// Full dynamic step list (Onboarding.md Part 3).
	const steps = $derived([
		'Set Password',
		'Business Profile',
		...(phoneStepApplies ? ['Phone Setup'] : []),
		...(carrierStepApplies ? ['Carrier Approval'] : []),
		'Branding'
	]);

	// Index of the step currently in progress. Branding is the terminal step, so
	// it maps to the last list item.
	const activeIndex = $derived.by(() => {
		switch (phase) {
			case 'password':
				return 0;
			case 'business':
				return 1;
			case 'phone':
				return steps.indexOf('Phone Setup');
			case 'carrier':
				return steps.indexOf('Carrier Approval');
			case 'branding':
				return steps.length - 1;
			default:
				return 0;
		}
	});

	function stepStatus(i: number): 'done' | 'active' | 'upcoming' {
		if (i < activeIndex) return 'done';
		if (i === activeIndex) return 'active';
		return 'upcoming';
	}

	const selectedCountryName = $derived(countryName(country));

	const inputClass =
		'flex h-11 w-full rounded-xl border border-border/70 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 transition-all duration-150 focus:border-primary/60 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50';
	const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-muted-foreground';

	onMount(async () => {
		try {
			const res = await fetch('/api/onboarding/state');
			if (res.status === 401) {
				goto('/auth/login');
				return;
			}
			if (!res.ok) {
				formError = 'Could not load your setup. Refresh to try again.';
				phase = 'password';
				return;
			}
			const { data } = (await res.json()) as {
				data: {
					status: string;
					sms_enabled: boolean;
					password_changed: boolean;
					business_profile_complete: boolean;
					has_number: boolean;
					phone_number: string | null;
					carrier_complete: boolean;
					carrier: {
						legal_business_name: string | null;
						ein: string | null;
						business_number: string | null;
						website: string | null;
						messaging_use_case: string | null;
					};
					profile: {
						name: string;
						trade_type: string;
						country: string | null;
						timezone: string;
						address: string | null;
						city: string | null;
						state: string | null;
						zip: string | null;
					};
					branding: {
						primary_color: string | null;
						calendar_day_start_hour: number;
						calendar_day_end_hour: number;
					};
				};
			};
			if (data.status !== 'pending_setup') {
				goto('/dashboard');
				return;
			}
			smsEnabled = data.sms_enabled;
			hasNumber = data.has_number;

			// Prefill the carrier form (Step 4) from current org values.
			legalBusinessName = data.carrier.legal_business_name ?? '';
			ein = data.carrier.ein ?? '';
			website = data.carrier.website ?? '';
			messagingUseCase = data.carrier.messaging_use_case ?? '';
			businessNumber = data.carrier.business_number ?? '';

			// Prefill the business form from current org values.
			bizName = data.profile.name ?? '';
			tradeType = data.profile.trade_type ?? '';
			country = data.profile.country ?? '';
			timezone = data.profile.timezone ?? '';
			address = data.profile.address ?? '';
			city = data.profile.city ?? '';
			stateRegion = data.profile.state ?? '';
			zip = data.profile.zip ?? '';

			// Prefill branding (Step 5) from current org values.
			primaryColor = data.branding.primary_color ?? '';
			dayStart = data.branding.calendar_day_start_hour;
			dayEnd = data.branding.calendar_day_end_hour;

			// Resume to the first unfinished step. The phone step (Step 3) applies
			// when SMS is enabled, the region is supported, and no number exists yet.
			// The carrier step (Step 4) applies to gated markets (US/CA) once a number
			// exists and its details aren't filled. Branding is the terminal, skippable
			// step — once prior steps are done, land there.
			phase = !data.password_changed
				? 'password'
				: !data.business_profile_complete
					? 'business'
					: smsEnabled && isSmsSupportedCountry(data.profile.country) && !data.has_number
						? 'phone'
						: smsEnabled &&
							  smsCountrySupport(data.profile.country) === 'gated' &&
							  data.has_number &&
							  !data.carrier_complete
							? 'carrier'
							: 'branding';
		} catch {
			formError = 'Could not load your setup. Refresh to try again.';
			phase = 'password';
		}
	});

	async function submitPassword(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;
		submitting = true;
		formError = null;
		fieldErrors = {};

		try {
			const res = await fetch('/api/onboarding/password', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ password, confirm_password: confirmPassword })
			});

			if (res.status === 204) {
				password = '';
				confirmPassword = '';
				phase = 'business';
				return;
			}

			const body = (await res.json().catch(() => null)) as {
				error?: string;
				field_errors?: Record<string, string>;
			} | null;
			formError = body?.error ?? 'Unable to update password. Try again.';
			fieldErrors = body?.field_errors ?? {};
		} catch {
			formError = 'Network error. Try again.';
		} finally {
			submitting = false;
		}
	}

	async function submitBusinessProfile(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;
		submitting = true;
		formError = null;
		fieldErrors = {};

		try {
			const res = await fetch('/api/onboarding/business-profile', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: bizName,
					trade_type: tradeType,
					country,
					timezone,
					address,
					city,
					state: stateRegion,
					zip
				})
			});

			if (res.status === 204) {
				phase = phoneStepApplies ? 'phone' : 'branding';
				return;
			}

			const body = (await res.json().catch(() => null)) as {
				error?: string;
				field_errors?: Record<string, string>;
			} | null;
			formError = body?.error ?? 'Could not save your business profile. Try again.';
			fieldErrors = body?.field_errors ?? {};
		} catch {
			formError = 'Network error. Try again.';
		} finally {
			submitting = false;
		}
	}

	async function searchNumbers(e: SubmitEvent) {
		e.preventDefault();
		if (searching) return;
		searching = true;
		formError = null;
		fieldErrors = {};
		selectedNumber = '';

		try {
			const res = await fetch('/api/onboarding/phone/search', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ postalCode })
			});

			if (res.ok) {
				const { data } = (await res.json()) as { data: { numbers: AvailableNumber[] } };
				numbers = data.numbers;
				searched = true;
				return;
			}

			const body = (await res.json().catch(() => null)) as {
				error?: string;
				field_errors?: Record<string, string>;
			} | null;
			formError = body?.error ?? 'Could not search numbers. Try again.';
			fieldErrors = body?.field_errors ?? {};
		} catch {
			formError = 'Network error. Try again.';
		} finally {
			searching = false;
		}
	}

	async function purchaseNumber() {
		if (submitting || !selectedNumber) return;
		submitting = true;
		formError = null;

		try {
			const res = await fetch('/api/onboarding/phone/purchase', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ phoneNumber: selectedNumber })
			});

			if (res.ok) {
				hasNumber = true;
				// US/CA → collect carrier details next; other markets → branding.
				phase = carrierStepApplies ? 'carrier' : 'branding';
				return;
			}

			const body = (await res.json().catch(() => null)) as { error?: string } | null;
			formError = body?.error ?? 'Could not purchase this number. Try again.';
			// The chosen number may have just been taken — let them search again.
			if (res.status === 502) {
				numbers = [];
				searched = false;
				selectedNumber = '';
			}
		} catch {
			formError = 'Network error. Try again.';
		} finally {
			submitting = false;
		}
	}

	function skipPhone() {
		formError = null;
		// No number → carrier registration doesn't apply; go straight to branding.
		phase = 'branding';
	}

	async function submitCarrier(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;
		submitting = true;
		formError = null;
		fieldErrors = {};

		// Country drives which fields are sent; the server re-derives it from the org.
		const payload =
			country === 'US'
				? {
						legal_business_name: legalBusinessName,
						ein,
						website,
						messaging_use_case: messagingUseCase
					}
				: { legal_business_name: legalBusinessName, business_number: businessNumber };

		try {
			const res = await fetch('/api/onboarding/carrier', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (res.status === 204) {
				phase = 'branding';
				return;
			}

			const body = (await res.json().catch(() => null)) as {
				error?: string;
				field_errors?: Record<string, string>;
			} | null;
			formError = body?.error ?? 'Could not save your details. Try again.';
			fieldErrors = body?.field_errors ?? {};
		} catch {
			formError = 'Network error. Try again.';
		} finally {
			submitting = false;
		}
	}

	function skipCarrier() {
		formError = null;
		phase = 'branding';
	}

	// Flip the org out of pending_setup and land on the dashboard.
	async function completeOnboarding(): Promise<boolean> {
		const res = await fetch('/api/onboarding/complete', { method: 'POST' });
		if (res.status === 204) {
			goto('/dashboard');
			return true;
		}
		const body = (await res.json().catch(() => null)) as { error?: string } | null;
		formError = body?.error ?? 'Could not complete setup. Try again.';
		return false;
	}

	// Save branding, then complete onboarding.
	async function saveBrandingAndFinish() {
		if (submitting) return;
		submitting = true;
		formError = null;
		fieldErrors = {};

		try {
			const res = await fetch('/api/onboarding/branding', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					primary_color: primaryColor,
					calendar_day_start_hour: dayStart,
					calendar_day_end_hour: dayEnd
				})
			});

			if (res.status === 204) {
				await completeOnboarding();
				return;
			}

			const body = (await res.json().catch(() => null)) as {
				error?: string;
				field_errors?: Record<string, string>;
			} | null;
			formError = body?.error ?? 'Could not save your branding. Try again.';
			fieldErrors = body?.field_errors ?? {};
		} catch {
			formError = 'Network error. Try again.';
		} finally {
			submitting = false;
		}
	}

	// Skip branding entirely — discard unsaved edits and complete onboarding.
	async function skipBranding() {
		if (submitting) return;
		submitting = true;
		formError = null;
		try {
			await completeOnboarding();
		} catch {
			formError = 'Network error. Try again.';
		} finally {
			submitting = false;
		}
	}

	const cardTitle = $derived(
		phase === 'branding'
			? 'Add your branding'
			: phase === 'carrier'
				? 'Carrier registration'
				: phase === 'phone'
					? 'Get a business number'
					: phase === 'business'
						? 'Tell us about your business'
						: 'Set your password'
	);
	const cardDescription = $derived(
		phase === 'branding'
			? 'Pick a brand color and set your working hours, or skip and finish — you can change these anytime.'
			: phase === 'carrier'
				? country === 'CA'
					? 'Canadian numbers need CWTA registration before texting. Add these details now, or skip and finish them later.'
					: 'US numbers need 10DLC registration before texting. Add these details now, or skip and finish them later.'
				: phase === 'phone'
					? 'Add a dedicated number for calls and texts, or skip and set it up later.'
					: phase === 'business'
						? 'A few details so we can set up your account and region correctly.'
						: 'Choose a strong password to secure your account before continuing.'
	);
</script>

<svelte:head>
	<title>Welcome — Set up your account</title>
</svelte:head>

{#if phase === 'loading'}
	<div class="flex min-h-screen items-center justify-center bg-background">
		<Loader2 class="h-8 w-8 animate-spin text-primary" />
	</div>
{:else}
	<AuthCard title={cardTitle} description={cardDescription}>
		{#snippet children()}
			<!-- Step progress -->
			<ol class="mb-6 flex flex-wrap items-center gap-x-2 gap-y-2">
				{#each steps as label, i (label)}
					{@const status = stepStatus(i)}
					<li class="flex items-center gap-1.5">
						<span
							class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold {status ===
							'done'
								? 'bg-primary text-white'
								: status === 'active'
									? 'border border-primary text-primary'
									: 'border border-border/70 text-muted-foreground/60'}"
						>
							{#if status === 'done'}
								<Check class="h-3 w-3" />
							{:else}
								{i + 1}
							{/if}
						</span>
						<span
							class="text-xs font-medium {status === 'active'
								? 'text-foreground'
								: status === 'done'
									? 'text-muted-foreground'
									: 'text-muted-foreground/60'}"
						>
							{label}
						</span>
						{#if i < steps.length - 1}
							<span class="mx-0.5 text-muted-foreground/30">·</span>
						{/if}
					</li>
				{/each}
			</ol>

			{#if formError}
				<div class="mb-5">
					<AuthAlert message={formError} variant="destructive" />
				</div>
			{/if}

			{#if phase === 'password'}
				<form class="space-y-5" onsubmit={submitPassword}>
					<div class="space-y-1.5">
						<label for="password" class={labelClass}>
							New password<span class="ml-0.5 text-destructive">*</span>
						</label>
						<input
							id="password"
							name="password"
							type="password"
							autocomplete="new-password"
							minlength={8}
							placeholder="At least 8 characters"
							required
							bind:value={password}
							disabled={submitting}
							class={inputClass}
						/>
						{#if fieldErrors.password}
							<p class="text-xs text-destructive">{fieldErrors.password}</p>
						{/if}
					</div>

					<div class="space-y-1.5">
						<label for="confirm_password" class={labelClass}>
							Confirm password<span class="ml-0.5 text-destructive">*</span>
						</label>
						<input
							id="confirm_password"
							name="confirm_password"
							type="password"
							autocomplete="new-password"
							minlength={8}
							placeholder="Repeat your password"
							required
							bind:value={confirmPassword}
							disabled={submitting}
							class={inputClass}
						/>
						{#if fieldErrors.confirm_password}
							<p class="text-xs text-destructive">{fieldErrors.confirm_password}</p>
						{/if}
					</div>

					<button
						type="submit"
						disabled={submitting}
						class="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white shadow-md shadow-primary/20 transition-all duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{#if submitting}
							<Loader2 class="h-4 w-4 animate-spin" />
							Updating…
						{:else}
							Set password & continue
						{/if}
					</button>
				</form>
			{:else if phase === 'business'}
				<form class="space-y-5" onsubmit={submitBusinessProfile}>
					<div class="space-y-1.5">
						<label for="biz_name" class={labelClass}>
							Company name<span class="ml-0.5 text-destructive">*</span>
						</label>
						<input
							id="biz_name"
							type="text"
							autocomplete="organization"
							placeholder="Acme Plumbing & Heating"
							required
							bind:value={bizName}
							disabled={submitting}
							class={inputClass}
						/>
						{#if fieldErrors.name}
							<p class="text-xs text-destructive">{fieldErrors.name}</p>
						{/if}
					</div>

					<div class="space-y-1.5">
						<label for="trade_type" class={labelClass}>
							Trade type<span class="ml-0.5 text-destructive">*</span>
						</label>
						<input
							id="trade_type"
							type="text"
							placeholder="Plumbing, HVAC, Roofing…"
							required
							bind:value={tradeType}
							disabled={submitting}
							class={inputClass}
						/>
						{#if fieldErrors.trade_type}
							<p class="text-xs text-destructive">{fieldErrors.trade_type}</p>
						{/if}
					</div>

					<div class="space-y-1.5">
						<label for="country" class={labelClass}>
							Country<span class="ml-0.5 text-destructive">*</span>
						</label>
						<Select.Root bind:value={country} disabled={submitting}>
							<Select.Trigger id="country" class="h-11 w-full rounded-xl">
								{selectedCountryName ?? 'Select your country'}
							</Select.Trigger>
							<Select.Content>
								{#each COUNTRY_OPTIONS as opt (opt.code)}
									<Select.Item value={opt.code} label={opt.name}>{opt.name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<p class="text-[11px] text-muted-foreground/70">
							Determines phone number availability and messaging compliance.
						</p>
						{#if fieldErrors.country}
							<p class="text-xs text-destructive">{fieldErrors.country}</p>
						{/if}
					</div>

					<div class="space-y-1.5">
						<label for="timezone" class={labelClass}>
							Timezone<span class="ml-0.5 text-destructive">*</span>
						</label>
						<TimezoneCombobox
							id="timezone"
							bind:value={timezone}
							disabled={submitting}
							invalid={Boolean(fieldErrors.timezone)}
							class="rounded-xl"
						/>
						{#if fieldErrors.timezone}
							<p class="text-xs text-destructive">{fieldErrors.timezone}</p>
						{/if}
					</div>

					<div class="space-y-1.5">
						<label for="address" class={labelClass}>Street address</label>
						<input
							id="address"
							type="text"
							autocomplete="street-address"
							placeholder="123 Main St"
							bind:value={address}
							disabled={submitting}
							class={inputClass}
						/>
					</div>

					<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<div class="space-y-1.5">
							<label for="city" class={labelClass}>City</label>
							<input
								id="city"
								type="text"
								autocomplete="address-level2"
								placeholder="Austin"
								bind:value={city}
								disabled={submitting}
								class={inputClass}
							/>
						</div>
						<div class="space-y-1.5">
							<label for="state" class={labelClass}>State / Region</label>
							<input
								id="state"
								type="text"
								autocomplete="address-level1"
								placeholder="TX"
								bind:value={stateRegion}
								disabled={submitting}
								class={inputClass}
							/>
						</div>
						<div class="space-y-1.5">
							<label for="zip" class={labelClass}>ZIP / Postal</label>
							<input
								id="zip"
								type="text"
								autocomplete="postal-code"
								placeholder="78701"
								bind:value={zip}
								disabled={submitting}
								class={inputClass}
							/>
						</div>
					</div>

					<button
						type="submit"
						disabled={submitting}
						class="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white shadow-md shadow-primary/20 transition-all duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{#if submitting}
							<Loader2 class="h-4 w-4 animate-spin" />
							Saving…
						{:else}
							Save & continue
						{/if}
					</button>
				</form>
			{:else if phase === 'phone'}
				<div class="space-y-5">
					<form class="flex items-end gap-3" onsubmit={searchNumbers}>
						<div class="flex-1 space-y-1.5">
							<label for="postal_code" class={labelClass}>ZIP / Postal code</label>
							<input
								id="postal_code"
								type="text"
								inputmode="text"
								autocomplete="postal-code"
								placeholder="78701"
								bind:value={postalCode}
								disabled={searching || submitting}
								class={inputClass}
							/>
						</div>
						<button
							type="submit"
							disabled={searching || submitting || postalCode.trim().length < 2}
							class="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border/70 bg-card px-4 text-sm font-semibold text-foreground transition-all duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{#if searching}
								<Loader2 class="h-4 w-4 animate-spin" />
								Searching…
							{:else}
								Search
							{/if}
						</button>
					</form>
					{#if fieldErrors.postalCode}
						<p class="text-xs text-destructive">{fieldErrors.postalCode}</p>
					{/if}

					{#if searched && numbers.length === 0}
						<p class="text-sm text-muted-foreground">
							No numbers available for that area. Try a different ZIP / postal code.
						</p>
					{:else if numbers.length > 0}
						<fieldset class="space-y-2">
							<legend class="sr-only">Available numbers</legend>
							{#each numbers as num (num.phoneNumber)}
								<label
									class="flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-150 {selectedNumber ===
									num.phoneNumber
										? 'border-primary bg-primary/5 ring-1 ring-primary/30'
										: 'border-border/70 hover:bg-muted/40'}"
								>
									<input
										type="radio"
										name="phone_number"
										value={num.phoneNumber}
										bind:group={selectedNumber}
										disabled={submitting}
										class="h-4 w-4 accent-primary"
									/>
									<span class="flex-1">
										<span class="block text-sm font-semibold text-foreground">
											{num.friendlyName}
										</span>
										{#if num.locality || num.region}
											<span class="block text-xs text-muted-foreground">
												{[num.locality, num.region].filter(Boolean).join(', ')}
											</span>
										{/if}
									</span>
								</label>
							{/each}
						</fieldset>
					{/if}

					<div class="space-y-3">
						<button
							type="button"
							onclick={purchaseNumber}
							disabled={submitting || !selectedNumber}
							class="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white shadow-md shadow-primary/20 transition-all duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{#if submitting}
								<Loader2 class="h-4 w-4 animate-spin" />
								Setting up your number…
							{:else}
								Get this number
							{/if}
						</button>
						<button
							type="button"
							onclick={skipPhone}
							disabled={submitting}
							class="flex h-11 w-full items-center justify-center rounded-xl text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
						>
							Skip for now
						</button>
					</div>
					<p class="text-[11px] leading-relaxed text-muted-foreground/70">
						You can set up a number later from Settings → Integrations. One number per organization.
					</p>
				</div>
			{:else if phase === 'carrier'}
				<form class="space-y-5" onsubmit={submitCarrier}>
					<div class="space-y-1.5">
						<label for="legal_business_name" class={labelClass}>
							{country === 'CA' ? 'Business name' : 'Legal business name'}<span
								class="ml-0.5 text-destructive">*</span
							>
						</label>
						<input
							id="legal_business_name"
							type="text"
							autocomplete="organization"
							placeholder="As registered with the government"
							required
							bind:value={legalBusinessName}
							disabled={submitting}
							class={inputClass}
						/>
						{#if fieldErrors.legal_business_name}
							<p class="text-xs text-destructive">{fieldErrors.legal_business_name}</p>
						{/if}
					</div>

					{#if country === 'US'}
						<div class="space-y-1.5">
							<label for="ein" class={labelClass}>
								EIN<span class="ml-0.5 text-destructive">*</span>
							</label>
							<input
								id="ein"
								type="text"
								inputmode="numeric"
								placeholder="12-3456789"
								required
								bind:value={ein}
								disabled={submitting}
								class={inputClass}
							/>
							{#if fieldErrors.ein}
								<p class="text-xs text-destructive">{fieldErrors.ein}</p>
							{/if}
						</div>

						<div class="space-y-1.5">
							<label for="website" class={labelClass}>
								Website<span class="ml-0.5 text-destructive">*</span>
							</label>
							<input
								id="website"
								type="text"
								inputmode="url"
								autocomplete="url"
								placeholder="https://yourbusiness.com"
								required
								bind:value={website}
								disabled={submitting}
								class={inputClass}
							/>
							{#if fieldErrors.website}
								<p class="text-xs text-destructive">{fieldErrors.website}</p>
							{/if}
						</div>

						<div class="space-y-1.5">
							<label for="messaging_use_case" class={labelClass}>
								Messaging use case<span class="ml-0.5 text-destructive">*</span>
							</label>
							<textarea
								id="messaging_use_case"
								rows={3}
								placeholder="How will you use texting? e.g. appointment reminders, quote follow-ups, and replies to customer enquiries."
								required
								bind:value={messagingUseCase}
								disabled={submitting}
								class="{inputClass} h-auto py-2.5"
							></textarea>
							{#if fieldErrors.messaging_use_case}
								<p class="text-xs text-destructive">{fieldErrors.messaging_use_case}</p>
							{/if}
						</div>
					{:else}
						<div class="space-y-1.5">
							<label for="business_number" class={labelClass}>
								Business Number<span class="ml-0.5 text-destructive">*</span>
							</label>
							<input
								id="business_number"
								type="text"
								inputmode="numeric"
								placeholder="9-digit CRA Business Number"
								required
								bind:value={businessNumber}
								disabled={submitting}
								class={inputClass}
							/>
							{#if fieldErrors.business_number}
								<p class="text-xs text-destructive">{fieldErrors.business_number}</p>
							{/if}
						</div>
					{/if}

					<p class="text-[11px] leading-relaxed text-muted-foreground/70">
						Your number works for calls and incoming texts right away. Outbound texting turns on
						once carrier registration is approved ({country === 'CA' ? '3–5' : '3–7'} business days).
					</p>

					<div class="space-y-3">
						<button
							type="submit"
							disabled={submitting}
							class="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white shadow-md shadow-primary/20 transition-all duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{#if submitting}
								<Loader2 class="h-4 w-4 animate-spin" />
								Saving…
							{:else}
								Save & continue
							{/if}
						</button>
						<button
							type="button"
							onclick={skipCarrier}
							disabled={submitting}
							class="flex h-11 w-full items-center justify-center rounded-xl text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
						>
							Skip for now
						</button>
					</div>
				</form>
			{:else if phase === 'branding'}
				<div class="space-y-6">
					<!-- Brand color -->
					<div class="space-y-1.5">
						<span class={labelClass}>Brand color</span>
						<div class="flex items-center gap-2">
							<input
								id="primary_color"
								type="text"
								placeholder="#3b82f6"
								maxlength={7}
								bind:value={primaryColor}
								disabled={submitting}
								class="{inputClass} font-mono"
							/>
							<Popover.Root>
								<Popover.Trigger
									type="button"
									aria-label="Open color picker"
									disabled={submitting}
									class={cn(
										'h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-border/70 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50'
									)}
									style={`background-color: ${primaryColor || 'transparent'}`}
								>
									{#if !primaryColor}
										<span
											class="block h-full w-full bg-gradient-to-br from-rose-400 via-amber-300 to-sky-400 opacity-60"
										></span>
									{/if}
								</Popover.Trigger>
								<Popover.Content class="w-64 p-3">
									<div class="grid grid-cols-5 gap-2">
										{#each SWATCHES as swatch (swatch)}
											<button
												type="button"
												aria-label={swatch}
												class={cn(
													'h-8 w-8 rounded-md border transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-popover',
													primaryColor.toLowerCase() === swatch
														? 'border-foreground ring-2 ring-ring'
														: 'border-border'
												)}
												style:background-color={swatch}
												onclick={() => (primaryColor = swatch)}
											></button>
										{/each}
									</div>
									<div class="mt-3 flex items-center gap-2 border-t border-border pt-3">
										<label
											class="relative h-8 w-8 cursor-pointer overflow-hidden rounded-md border border-border"
											aria-label="Pick a custom color"
										>
											<input
												type="color"
												class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
												value={primaryColor || '#3b82f6'}
												oninput={(e) =>
													(primaryColor = (e.currentTarget as HTMLInputElement).value)}
											/>
											<span
												class="block h-full w-full"
												style:background-color={primaryColor || '#3b82f6'}
											></span>
										</label>
										<span class="text-xs text-muted-foreground">Custom hex</span>
										{#if primaryColor}
											<button
												type="button"
												class="ml-auto text-xs text-muted-foreground hover:text-foreground"
												onclick={() => (primaryColor = '')}
											>
												Clear
											</button>
										{/if}
									</div>
								</Popover.Content>
							</Popover.Root>
						</div>
						{#if fieldErrors.primary_color}
							<p class="text-xs text-destructive">{fieldErrors.primary_color}</p>
						{:else}
							<p class="text-[11px] text-muted-foreground/70">
								Used on customer-facing assets like invoices, quotes, and reminders.
							</p>
						{/if}
					</div>

					<!-- Working hours -->
					<div class="space-y-1.5">
						<span class={labelClass}>Working hours</span>
						<div class="grid grid-cols-2 gap-3">
							<select id="day_start" bind:value={dayStart} disabled={submitting} class={inputClass}>
								{#each HOUR_OPTIONS.slice(0, 24) as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
							<select id="day_end" bind:value={dayEnd} disabled={submitting} class={inputClass}>
								{#each HOUR_OPTIONS.slice(1) as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</div>
						{#if fieldErrors.calendar_day_end_hour}
							<p class="text-xs text-destructive">{fieldErrors.calendar_day_end_hour}</p>
						{:else}
							<p class="text-[11px] text-muted-foreground/70">
								Sets the time range shown on your Appointments calendar.
							</p>
						{/if}
					</div>

					<p class="text-[11px] leading-relaxed text-muted-foreground/70">
						You can add your logo anytime in Settings → Organization.
					</p>

					<div class="space-y-3">
						<button
							type="button"
							onclick={saveBrandingAndFinish}
							disabled={submitting}
							class="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white shadow-md shadow-primary/20 transition-all duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{#if submitting}
								<Loader2 class="h-4 w-4 animate-spin" />
								Finishing…
							{:else}
								Finish setup & go to dashboard
							{/if}
						</button>
						<button
							type="button"
							onclick={skipBranding}
							disabled={submitting}
							class="flex h-11 w-full items-center justify-center rounded-xl text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
						>
							Skip & finish
						</button>
					</div>
				</div>
			{/if}
		{/snippet}
	</AuthCard>
{/if}
