<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
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
	<div class="onb-loading">
		<i class="ri-loader-4-line animate-spin onb-loading__spinner" aria-hidden="true"></i>
	</div>
{:else}
	<AuthCard title={cardTitle} description={cardDescription}>
		{#snippet children()}
			<!-- Step progress -->
			<ol class="onb-steps">
				{#each steps as label, i (label)}
					{@const status = stepStatus(i)}
					<li class="onb-steps__item">
						<span class="onb-steps__bullet onb-steps__bullet--{status}">
							{#if status === 'done'}
								<i class="ri-check-line" aria-hidden="true"></i>
							{:else}
								{i + 1}
							{/if}
						</span>
						<span class="onb-steps__label onb-steps__label--{status}">{label}</span>
						{#if i < steps.length - 1}
							<span class="onb-steps__sep" aria-hidden="true">·</span>
						{/if}
					</li>
				{/each}
			</ol>

			{#if formError}
				<div class="onb-alert">
					<AuthAlert message={formError} variant="destructive" />
				</div>
			{/if}

			{#if phase === 'password'}
				<form class="onb-form" onsubmit={submitPassword}>
					<div class="field">
						<label for="password" class="field__label field__label--required">New password</label>
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
							class="field__input"
							class:field__input--error={fieldErrors.password}
						/>
						{#if fieldErrors.password}
							<p class="field__error">{fieldErrors.password}</p>
						{/if}
					</div>

					<div class="field">
						<label for="confirm_password" class="field__label field__label--required">
							Confirm password
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
							class="field__input"
							class:field__input--error={fieldErrors.confirm_password}
						/>
						{#if fieldErrors.confirm_password}
							<p class="field__error">{fieldErrors.confirm_password}</p>
						{/if}
					</div>

					<Button type="submit" class="btn--full" loading={submitting} loadingLabel="Updating…">
						Set password & continue
					</Button>
				</form>
			{:else if phase === 'business'}
				<form class="onb-form" onsubmit={submitBusinessProfile}>
					<div class="field">
						<label for="biz_name" class="field__label field__label--required">Company name</label>
						<input
							id="biz_name"
							type="text"
							autocomplete="organization"
							placeholder="Acme Plumbing & Heating"
							required
							bind:value={bizName}
							disabled={submitting}
							class="field__input"
							class:field__input--error={fieldErrors.name}
						/>
						{#if fieldErrors.name}
							<p class="field__error">{fieldErrors.name}</p>
						{/if}
					</div>

					<div class="field">
						<label for="trade_type" class="field__label field__label--required">Trade type</label>
						<input
							id="trade_type"
							type="text"
							placeholder="Plumbing, HVAC, Roofing…"
							required
							bind:value={tradeType}
							disabled={submitting}
							class="field__input"
							class:field__input--error={fieldErrors.trade_type}
						/>
						{#if fieldErrors.trade_type}
							<p class="field__error">{fieldErrors.trade_type}</p>
						{/if}
					</div>

					<div class="field">
						<label for="country" class="field__label field__label--required">Country</label>
						<Select.Root bind:value={country} disabled={submitting}>
							<Select.Trigger id="country" class="field__input">
								{selectedCountryName ?? 'Select your country'}
							</Select.Trigger>
							<Select.Content>
								{#each COUNTRY_OPTIONS as opt (opt.code)}
									<Select.Item value={opt.code} label={opt.name}>{opt.name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						{#if fieldErrors.country}
							<p class="field__error">{fieldErrors.country}</p>
						{:else}
							<p class="field__hint">
								Determines phone number availability and messaging compliance.
							</p>
						{/if}
					</div>

					<div class="field">
						<label for="timezone" class="field__label field__label--required">Timezone</label>
						<TimezoneCombobox
							id="timezone"
							bind:value={timezone}
							disabled={submitting}
							invalid={Boolean(fieldErrors.timezone)}
						/>
						{#if fieldErrors.timezone}
							<p class="field__error">{fieldErrors.timezone}</p>
						{/if}
					</div>

					<div class="field">
						<label for="address" class="field__label">Street address</label>
						<input
							id="address"
							type="text"
							autocomplete="street-address"
							placeholder="123 Main St"
							bind:value={address}
							disabled={submitting}
							class="field__input"
						/>
					</div>

					<div class="onb-grid">
						<div class="field">
							<label for="city" class="field__label">City</label>
							<input
								id="city"
								type="text"
								autocomplete="address-level2"
								placeholder="Austin"
								bind:value={city}
								disabled={submitting}
								class="field__input"
							/>
						</div>
						<div class="field">
							<label for="state" class="field__label">State / Region</label>
							<input
								id="state"
								type="text"
								autocomplete="address-level1"
								placeholder="TX"
								bind:value={stateRegion}
								disabled={submitting}
								class="field__input"
							/>
						</div>
						<div class="field">
							<label for="zip" class="field__label">ZIP / Postal</label>
							<input
								id="zip"
								type="text"
								autocomplete="postal-code"
								placeholder="78701"
								bind:value={zip}
								disabled={submitting}
								class="field__input"
							/>
						</div>
					</div>

					<Button type="submit" class="btn--full" loading={submitting} loadingLabel="Saving…">
						Save & continue
					</Button>
				</form>
			{:else if phase === 'phone'}
				<div class="onb-form">
					<form class="onb-search" onsubmit={searchNumbers}>
						<div class="field onb-search__field">
							<label for="postal_code" class="field__label">ZIP / Postal code</label>
							<input
								id="postal_code"
								type="text"
								inputmode="text"
								autocomplete="postal-code"
								placeholder="78701"
								bind:value={postalCode}
								disabled={searching || submitting}
								class="field__input"
							/>
						</div>
						<button
							type="submit"
							disabled={searching || submitting || postalCode.trim().length < 2}
							class="btn btn--secondary onb-search__btn"
						>
							{#if searching}
								<i class="ri-loader-4-line animate-spin" aria-hidden="true"></i>
								Searching…
							{:else}
								Search
							{/if}
						</button>
					</form>
					{#if fieldErrors.postalCode}
						<p class="field__error">{fieldErrors.postalCode}</p>
					{/if}

					{#if searched && numbers.length === 0}
						<p class="onb-empty">
							No numbers available for that area. Try a different ZIP / postal code.
						</p>
					{:else if numbers.length > 0}
						<fieldset class="onb-numbers">
							<legend class="onb-sr">Available numbers</legend>
							{#each numbers as num (num.phoneNumber)}
								<label
									class="onb-number"
									class:onb-number--selected={selectedNumber === num.phoneNumber}
								>
									<input
										type="radio"
										name="phone_number"
										value={num.phoneNumber}
										bind:group={selectedNumber}
										disabled={submitting}
										class="onb-number__radio"
									/>
									<span class="onb-number__main">
										<span class="onb-number__name">{num.friendlyName}</span>
										{#if num.locality || num.region}
											<span class="onb-number__loc">
												{[num.locality, num.region].filter(Boolean).join(', ')}
											</span>
										{/if}
									</span>
								</label>
							{/each}
						</fieldset>
					{/if}

					<div class="onb-actions">
						<button
							type="button"
							onclick={purchaseNumber}
							disabled={submitting || !selectedNumber}
							class="btn btn--primary btn--full"
						>
							{#if submitting}
								<i class="ri-loader-4-line animate-spin" aria-hidden="true"></i>
								Setting up your number…
							{:else}
								Get this number
							{/if}
						</button>
						<button
							type="button"
							onclick={skipPhone}
							disabled={submitting}
							class="btn btn--ghost btn--full"
						>
							Skip for now
						</button>
					</div>
					<p class="onb-note">
						You can set up a number later from Settings → Integrations. One number per organization.
					</p>
				</div>
			{:else if phase === 'carrier'}
				<form class="onb-form" onsubmit={submitCarrier}>
					<div class="field">
						<label for="legal_business_name" class="field__label field__label--required">
							{country === 'CA' ? 'Business name' : 'Legal business name'}
						</label>
						<input
							id="legal_business_name"
							type="text"
							autocomplete="organization"
							placeholder="As registered with the government"
							required
							bind:value={legalBusinessName}
							disabled={submitting}
							class="field__input"
							class:field__input--error={fieldErrors.legal_business_name}
						/>
						{#if fieldErrors.legal_business_name}
							<p class="field__error">{fieldErrors.legal_business_name}</p>
						{/if}
					</div>

					{#if country === 'US'}
						<div class="field">
							<label for="ein" class="field__label field__label--required">EIN</label>
							<input
								id="ein"
								type="text"
								inputmode="numeric"
								placeholder="12-3456789"
								required
								bind:value={ein}
								disabled={submitting}
								class="field__input"
								class:field__input--error={fieldErrors.ein}
							/>
							{#if fieldErrors.ein}
								<p class="field__error">{fieldErrors.ein}</p>
							{/if}
						</div>

						<div class="field">
							<label for="website" class="field__label field__label--required">Website</label>
							<input
								id="website"
								type="text"
								inputmode="url"
								autocomplete="url"
								placeholder="https://yourbusiness.com"
								required
								bind:value={website}
								disabled={submitting}
								class="field__input"
								class:field__input--error={fieldErrors.website}
							/>
							{#if fieldErrors.website}
								<p class="field__error">{fieldErrors.website}</p>
							{/if}
						</div>

						<div class="field">
							<label for="messaging_use_case" class="field__label field__label--required">
								Messaging use case
							</label>
							<textarea
								id="messaging_use_case"
								rows={3}
								placeholder="How will you use texting? e.g. appointment reminders, quote follow-ups, and replies to customer enquiries."
								required
								bind:value={messagingUseCase}
								disabled={submitting}
								class="field__textarea"
								class:field__textarea--error={fieldErrors.messaging_use_case}
							></textarea>
							{#if fieldErrors.messaging_use_case}
								<p class="field__error">{fieldErrors.messaging_use_case}</p>
							{/if}
						</div>
					{:else}
						<div class="field">
							<label for="business_number" class="field__label field__label--required">
								Business Number
							</label>
							<input
								id="business_number"
								type="text"
								inputmode="numeric"
								placeholder="9-digit CRA Business Number"
								required
								bind:value={businessNumber}
								disabled={submitting}
								class="field__input"
								class:field__input--error={fieldErrors.business_number}
							/>
							{#if fieldErrors.business_number}
								<p class="field__error">{fieldErrors.business_number}</p>
							{/if}
						</div>
					{/if}

					<p class="onb-note">
						Your number works for calls and incoming texts right away. Outbound texting turns on
						once carrier registration is approved ({country === 'CA' ? '3–5' : '3–7'} business days).
					</p>

					<div class="onb-actions">
						<Button type="submit" class="btn--full" loading={submitting} loadingLabel="Saving…">
							Save & continue
						</Button>
						<Button
							type="button"
							variant="ghost"
							class="btn--full"
							onclick={skipCarrier}
							disabled={submitting}
						>
							Skip for now
						</Button>
					</div>
				</form>
			{:else if phase === 'branding'}
				<div class="onb-form onb-form--lg">
					<!-- Brand color -->
					<div class="field">
						<span class="field__label">Brand color</span>
						<div class="onb-color">
							<input
								id="primary_color"
								type="text"
								placeholder="#3b82f6"
								maxlength={7}
								bind:value={primaryColor}
								disabled={submitting}
								class="field__input onb-color__input"
							/>
							<Popover.Root>
								<Popover.Trigger
									type="button"
									aria-label="Open color picker"
									disabled={submitting}
									class="onb-swatch-trigger"
									style={`background-color: ${primaryColor || 'transparent'}`}
								>
									{#if !primaryColor}
										<span class="onb-swatch-trigger__rainbow"></span>
									{/if}
								</Popover.Trigger>
								<Popover.Content class="onb-color-pop">
									<div class="onb-swatches">
										{#each SWATCHES as swatch (swatch)}
											<button
												type="button"
												aria-label={swatch}
												class="onb-swatch"
												class:onb-swatch--active={primaryColor.toLowerCase() === swatch}
												style:background-color={swatch}
												onclick={() => (primaryColor = swatch)}
											></button>
										{/each}
									</div>
									<div class="onb-custom">
										<label class="onb-custom__well" aria-label="Pick a custom color">
											<input
												type="color"
												class="onb-custom__native"
												value={primaryColor || '#3b82f6'}
												oninput={(e) =>
													(primaryColor = (e.currentTarget as HTMLInputElement).value)}
											/>
											<span
												class="onb-custom__swatch"
												style:background-color={primaryColor || '#3b82f6'}
											></span>
										</label>
										<span class="onb-custom__label">Custom hex</span>
										{#if primaryColor}
											<button
												type="button"
												class="onb-custom__clear"
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
							<p class="field__error">{fieldErrors.primary_color}</p>
						{:else}
							<p class="field__hint">
								Used on customer-facing assets like invoices, quotes, and reminders.
							</p>
						{/if}
					</div>

					<!-- Working hours -->
					<div class="field">
						<span class="field__label">Working hours</span>
						<div class="onb-hours">
							<select
								id="day_start"
								bind:value={dayStart}
								disabled={submitting}
								class="field__select"
							>
								{#each HOUR_OPTIONS.slice(0, 24) as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
							<select id="day_end" bind:value={dayEnd} disabled={submitting} class="field__select">
								{#each HOUR_OPTIONS.slice(1) as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</div>
						{#if fieldErrors.calendar_day_end_hour}
							<p class="field__error">{fieldErrors.calendar_day_end_hour}</p>
						{:else}
							<p class="field__hint">Sets the time range shown on your Appointments calendar.</p>
						{/if}
					</div>

					<p class="onb-note">You can add your logo anytime in Settings → Organization.</p>

					<div class="onb-actions">
						<button
							type="button"
							onclick={saveBrandingAndFinish}
							disabled={submitting}
							class="btn btn--primary btn--full"
						>
							{#if submitting}
								<i class="ri-loader-4-line animate-spin" aria-hidden="true"></i>
								Finishing…
							{:else}
								Finish setup & go to dashboard
							{/if}
						</button>
						<button
							type="button"
							onclick={skipBranding}
							disabled={submitting}
							class="btn btn--ghost btn--full"
						>
							Skip & finish
						</button>
					</div>
				</div>
			{/if}
		{/snippet}
	</AuthCard>
{/if}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	// ── Loading ────────────────────────────────────────────────────────────────

	.onb-loading {
		display: flex;
		min-height: 100vh;
		align-items: center;
		justify-content: center;
		background: var(--color-bg-app);
	}

	.onb-loading__spinner {
		font-size: 32px;
		line-height: 1;
		color: var(--color-brand);
	}

	// ── Step progress ────────────────────────────────────────────────────────

	.onb-steps {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: $space-2;
		margin-bottom: $space-6;
	}

	.onb-steps__item {
		display: flex;
		align-items: center;
		gap: $space-1;
	}

	.onb-steps__bullet {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: $radius-full;
		font-size: 10px;
		font-weight: $weight-semibold;
		border: 1px solid var(--color-border-strong);
		color: var(--color-text-muted);

		i {
			font-size: 12px;
			line-height: 1;
		}

		&--done {
			background: var(--color-brand);
			border-color: var(--color-brand);
			color: #fff;
		}

		&--active {
			border-color: var(--color-brand);
			color: var(--color-brand);
		}
	}

	.onb-steps__label {
		font-size: $fs-body;
		font-weight: $weight-medium;
		color: var(--color-text-muted);

		&--active {
			color: var(--color-text-primary);
		}

		&--done {
			color: var(--color-text-secondary);
		}
	}

	.onb-steps__sep {
		margin: 0 2px;
		color: var(--color-text-muted);
		opacity: 0.5;
	}

	// ── Forms ────────────────────────────────────────────────────────────────

	.onb-alert {
		margin-bottom: $space-5;
	}

	.onb-form {
		display: flex;
		flex-direction: column;
		gap: $space-5;

		&--lg {
			gap: $space-6;
		}
	}

	.onb-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: $space-4;

		@media (min-width: $bp-mobile) {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	.onb-actions {
		display: flex;
		flex-direction: column;
		gap: $space-3;
	}

	.onb-note {
		font-size: $fs-caption;
		line-height: $lh-body;
		color: var(--color-text-muted);
	}

	.onb-empty {
		font-size: $fs-body;
		color: var(--color-text-secondary);
	}

	.onb-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	// ── Phone search ───────────────────────────────────────────────────────────

	.onb-search {
		display: flex;
		align-items: flex-end;
		gap: $space-3;
	}

	.onb-search__field {
		flex: 1;
	}

	.onb-search__btn {
		flex-shrink: 0;
		height: 44px;
	}

	// ── Available numbers ────────────────────────────────────────────────────

	.onb-numbers {
		display: flex;
		flex-direction: column;
		gap: $space-2;
		border: 0;
		padding: 0;
		margin: 0;
	}

	.onb-number {
		display: flex;
		align-items: center;
		gap: $space-3;
		cursor: pointer;
		border-radius: $radius-md;
		border: 1px solid var(--color-border-strong);
		padding: $space-3 $space-4;
		transition:
			border-color $duration-fast $ease-standard,
			background $duration-fast $ease-standard;

		&:hover {
			background: var(--color-bg-surface-sunk);
		}

		&--selected {
			border-color: var(--color-brand);
			background: var(--state-active-tint);
			box-shadow: 0 0 0 1px var(--color-brand);
		}
	}

	.onb-number__radio {
		width: 16px;
		height: 16px;
		accent-color: var(--color-brand);
	}

	.onb-number__main {
		flex: 1;
	}

	.onb-number__name {
		display: block;
		font-size: $fs-body;
		font-weight: $weight-semibold;
		color: var(--color-text-primary);
	}

	.onb-number__loc {
		display: block;
		font-size: $fs-caption;
		color: var(--color-text-secondary);
	}

	// ── Brand color picker ─────────────────────────────────────────────────────

	.onb-color {
		display: flex;
		align-items: center;
		gap: $space-2;
	}

	.onb-color__input {
		font-family: ui-monospace, 'SF Mono', monospace;
	}

	.onb-swatch-trigger {
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		overflow: hidden;
		border-radius: $radius-md;
		border: 1px solid var(--color-border-strong);
		cursor: pointer;
		transition: transform $duration-fast $ease-standard;

		&:hover {
			transform: scale(1.05);
		}

		&:focus-visible {
			outline: none;
			box-shadow: var(--shadow-focus);
		}

		&:disabled {
			cursor: not-allowed;
			opacity: 0.5;
		}
	}

	.onb-swatch-trigger__rainbow {
		display: block;
		width: 100%;
		height: 100%;
		opacity: 0.6;
		background: linear-gradient(135deg, #fb7185, #fcd34d, #38bdf8);
	}

	:global(.onb-color-pop) {
		width: 256px;
		padding: $space-3;
	}

	.onb-swatches {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: $space-2;
	}

	.onb-swatch {
		width: 32px;
		height: 32px;
		border-radius: $radius-sm;
		border: 1px solid var(--color-border);
		cursor: pointer;
		transition: transform $duration-fast $ease-standard;

		&:hover {
			transform: scale(1.1);
		}

		&--active {
			border-color: var(--color-text-primary);
			box-shadow: 0 0 0 2px var(--color-brand);
		}
	}

	.onb-custom {
		display: flex;
		align-items: center;
		gap: $space-2;
		margin-top: $space-3;
		padding-top: $space-3;
		border-top: 1px solid var(--color-border);
	}

	.onb-custom__well {
		position: relative;
		width: 32px;
		height: 32px;
		overflow: hidden;
		border-radius: $radius-sm;
		border: 1px solid var(--color-border);
		cursor: pointer;
	}

	.onb-custom__native {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}

	.onb-custom__swatch {
		display: block;
		width: 100%;
		height: 100%;
	}

	.onb-custom__label {
		font-size: $fs-body;
		color: var(--color-text-secondary);
	}

	.onb-custom__clear {
		margin-left: auto;
		font-size: $fs-body;
		color: var(--color-text-secondary);
		background: none;
		border: 0;
		cursor: pointer;

		&:hover {
			color: var(--color-text-primary);
		}
	}

	// ── Working hours ────────────────────────────────────────────────────────

	.onb-hours {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: $space-3;
	}
</style>
