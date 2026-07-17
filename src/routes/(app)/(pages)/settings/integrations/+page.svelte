<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';
	import { getOrgContext } from '$lib/context/org';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { countryName, isSmsSupportedCountry, smsCountrySupport } from '$lib/utils/countries';

	type MessengerStatus = {
		is_connected: boolean;
		page_name: string | null;
		connected_at: string | null;
	};
	type StripeStatus = { is_connected: boolean };

	const member = getMemberContext();
	const featureFlags = getFeatureFlagsContext();
	const org = getOrgContext();
	let m = $derived(member());
	let flags = $derived(featureFlags());
	let o = $derived(org());

	let loading = $state(true);
	let disconnecting = $state(false);
	let messenger = $state<MessengerStatus | null>(null);
	let stripe = $state<StripeStatus | null>(null);

	// ── SMS / Phone (Onboarding.md Part 7 — Settings mini-onboarding) ────────────
	// Five states, all derived from the org session (no extra fetch):
	//   SMS disabled · no number · unsupported region · pending approval · active.
	// `unsupported` only applies when there's no number yet — once a number exists
	// the org is live regardless of how we'd classify its country today.
	type AvailableNumber = {
		phoneNumber: string;
		friendlyName: string;
		locality: string | null;
		region: string | null;
	};
	let smsState = $derived(
		!o.sms_enabled
			? 'disabled'
			: !o.twilio_phone_number
				? isSmsSupportedCountry(o.country)
					? 'no_number'
					: 'unsupported'
				: o.sms_approval_status === 'pending'
					? 'pending'
					: 'active'
	);

	let showSetup = $state(false);
	let postalCode = $state('');
	let searching = $state(false);
	let numbers = $state<AvailableNumber[]>([]);
	let searched = $state(false);
	let selectedNumber = $state('');
	let purchasing = $state(false);
	let phoneError = $state<string | null>(null);
	let postalError = $state<string | null>(null);

	async function searchNumbers(e: SubmitEvent) {
		e.preventDefault();
		if (searching) return;
		searching = true;
		phoneError = null;
		postalError = null;
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
			postalError = body?.field_errors?.postalCode ?? null;
			phoneError = body?.error ?? 'Could not search numbers. Try again.';
		} catch {
			phoneError = 'Network error. Try again.';
		} finally {
			searching = false;
		}
	}

	// ── Carrier registration (Onboarding.md Part 7 — fill it later) ──────────────
	// Only gated markets (US 10DLC / CA CWTA) need carrier data. A contractor who
	// skipped Step 4 in onboarding lands here with a number stuck in `pending` and
	// no carrier details on file — the PO can't register the number until they're
	// submitted. Reuses POST /api/onboarding/carrier (accepts active orgs).
	const carrierGated = $derived(smsCountrySupport(o.country) === 'gated');
	const carrierComplete = $derived(
		o.country === 'US'
			? Boolean(o.legal_business_name && o.ein && o.website && o.messaging_use_case)
			: o.country === 'CA'
				? Boolean(o.legal_business_name && o.business_number)
				: false
	);
	// Show the carrier section only while the number is pending in a gated market.
	const showCarrierSection = $derived(smsState === 'pending' && carrierGated);

	let carrierEditing = $state(false);
	let carrierSubmitting = $state(false);
	let carrierError = $state<string | null>(null);
	let carrierFieldErrors = $state<Record<string, string>>({});
	let legalBusinessName = $state('');
	let ein = $state('');
	let website = $state('');
	let messagingUseCase = $state('');
	let businessNumber = $state('');

	function openCarrierForm() {
		// Seed from current org values (empty for a skipped org).
		legalBusinessName = o.legal_business_name ?? '';
		ein = o.ein ?? '';
		website = o.website ?? '';
		messagingUseCase = o.messaging_use_case ?? '';
		businessNumber = o.business_number ?? '';
		carrierError = null;
		carrierFieldErrors = {};
		carrierEditing = true;
	}

	async function submitCarrier(e: SubmitEvent) {
		e.preventDefault();
		if (carrierSubmitting) return;
		carrierSubmitting = true;
		carrierError = null;
		carrierFieldErrors = {};

		// Country drives the payload; the server re-derives it from the org.
		const payload =
			o.country === 'US'
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
				toast.success('Carrier details submitted for review.');
				// Refresh the session so the card + app-shell banner reflect the new state.
				await sessionStore.load(true);
				carrierEditing = false;
				return;
			}
			const body = (await res.json().catch(() => null)) as {
				error?: string;
				field_errors?: Record<string, string>;
			} | null;
			carrierError = body?.error ?? 'Could not save your details. Try again.';
			carrierFieldErrors = body?.field_errors ?? {};
		} catch {
			carrierError = 'Network error. Try again.';
		} finally {
			carrierSubmitting = false;
		}
	}

	async function purchaseNumber() {
		if (purchasing || !selectedNumber) return;
		purchasing = true;
		phoneError = null;
		try {
			const res = await fetch('/api/onboarding/phone/purchase', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ phoneNumber: selectedNumber })
			});
			if (res.ok) {
				toast.success('Business number set up.');
				// Refresh the session so the number + approval status (and the app-shell
				// SMS banner) reflect the new state immediately.
				await sessionStore.load(true);
				showSetup = false;
				numbers = [];
				searched = false;
				selectedNumber = '';
				postalCode = '';
				return;
			}
			const body = (await res.json().catch(() => null)) as { error?: string } | null;
			phoneError = body?.error ?? 'Could not purchase this number. Try again.';
			// The chosen number may have just been taken — let them search again.
			if (res.status === 502) {
				numbers = [];
				searched = false;
				selectedNumber = '';
			}
		} catch {
			phoneError = 'Network error. Try again.';
		} finally {
			purchasing = false;
		}
	}

	// The OAuth callback + chooser redirect back here with ?messenger=<reason>.
	// 'connected' is a success; every other code is a fault to surface as an error.
	const MESSENGER_TOASTS: Record<string, { variant: 'success' | 'error'; text: string }> = {
		connected: { variant: 'success', text: 'Facebook Page connected.' },
		cancelled: { variant: 'error', text: 'Facebook connection was cancelled.' },
		not_enabled: { variant: 'error', text: 'Messenger isn’t enabled on your plan.' },
		no_pages: { variant: 'error', text: 'No Facebook Pages were found on your account.' },
		page_taken: {
			variant: 'error',
			text: 'That Facebook Page is already connected to another account.'
		},
		subscribe_failed: {
			variant: 'error',
			text: 'Couldn’t subscribe the Page to messages. Please try again.'
		},
		exchange_failed: { variant: 'error', text: 'Facebook sign-in failed. Please try again.' },
		invalid_state: { variant: 'error', text: 'The connection expired. Please try again.' }
	};

	onMount(() => {
		if (m.role !== 'admin') {
			goto('/settings');
			return;
		}
		const reason = page.url.searchParams.get('messenger');
		if (reason) {
			const t = MESSENGER_TOASTS[reason];
			if (t) toast[t.variant](t.text);
			// Strip the query param so a refresh doesn't re-fire the toast.
			replaceState('/settings/integrations', page.state);
		}
		void load();
	});

	async function load() {
		loading = true;
		try {
			const [mRes, sRes] = await Promise.all([
				fetch('/api/settings/messenger').catch(() => null),
				fetch('/api/settings/stripe').catch(() => null)
			]);
			const mBody = (mRes ? await mRes.json().catch(() => ({})) : {}) as { data?: MessengerStatus };
			const sBody = (sRes ? await sRes.json().catch(() => ({})) : {}) as { data?: StripeStatus };
			messenger = mBody.data ?? { is_connected: false, page_name: null, connected_at: null };
			stripe = sBody.data ?? { is_connected: false };
		} finally {
			loading = false;
		}
	}

	async function disconnectMessenger() {
		if (
			!window.confirm(
				'Disconnect Messenger? You won’t send or receive Facebook messages until you reconnect.'
			)
		) {
			return;
		}
		disconnecting = true;
		try {
			const res = await fetch('/api/settings/messenger', { method: 'DELETE' });
			if (!res.ok) {
				toast.error('Disconnect failed');
				return;
			}
			toast.success('Messenger disconnected');
			messenger = { is_connected: false, page_name: null, connected_at: null };
		} catch {
			toast.error('Disconnect failed');
		} finally {
			disconnecting = false;
		}
	}

	function connectMessenger() {
		// Full-page navigation: the server route 302s to Facebook's OAuth dialog,
		// which a client-side goto() can't follow.
		window.location.href = '/api/settings/messenger/connect';
	}

	function formatDate(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head><title>Integrations</title></svelte:head>

<PageWrapper
	title="Integrations"
	subtitle="Connect the tools your business runs on."
	back="/settings"
>
	{#if loading}
		<SkeletonLoader lines={2} label="Loading integrations" height="104px" />
	{:else}
		<div class="integrations">
			<!-- Messenger -->
			<section class="integration">
				<div class="integration__main">
					<span class="integration__icon integration__icon--indigo" aria-hidden="true">
						<i class="ri-messenger-line"></i>
					</span>
					<div class="integration__body">
						<div class="integration__head">
							<h3 class="integration__title">Messenger</h3>
							{#if !flags.feature_messenger}
								<span class="integration__status integration__status--muted">Not on your plan</span>
							{:else if messenger?.is_connected}
								<span class="integration__status integration__status--ok">Connected</span>
							{/if}
						</div>
						<p class="integration__desc">
							{#if flags.feature_messenger && messenger?.is_connected}
								{messenger.page_name ?? 'Facebook Page'}{messenger.connected_at
									? ` · since ${formatDate(messenger.connected_at)}`
									: ''}
							{:else}
								Reply to Facebook messages from your inbox.
							{/if}
						</p>
					</div>
					{#if flags.feature_messenger}
						<div class="integration__action">
							{#if messenger?.is_connected}
								<Button
									variant="danger-outline"
									loading={disconnecting}
									loadingLabel="Disconnecting…"
									onclick={disconnectMessenger}
								>
									Disconnect
								</Button>
							{:else}
								<Button onclick={connectMessenger}>Connect Facebook Page</Button>
							{/if}
						</div>
					{/if}
				</div>
			</section>

			<!-- Payments -->
			<section class="integration">
				<div class="integration__main">
					<span class="integration__icon integration__icon--blue" aria-hidden="true">
						<i class="ri-bank-card-line"></i>
					</span>
					<div class="integration__body">
						<div class="integration__head">
							<h3 class="integration__title">Payments</h3>
							{#if !flags.feature_stripe_payments}
								<span class="integration__status integration__status--muted">Not on your plan</span>
							{:else if stripe?.is_connected}
								<span class="integration__status integration__status--ok">Connected</span>
							{/if}
						</div>
						<p class="integration__desc">Accept card payments on your invoices via Stripe.</p>
					</div>
					{#if flags.feature_stripe_payments}
						<div class="integration__action">
							<Button variant="outline" onclick={() => goto('/settings/stripe')}>
								{stripe?.is_connected ? 'Manage' : 'Set up'}
							</Button>
						</div>
					{/if}
				</div>
			</section>

			<!-- SMS / Phone -->
			<section class="integration">
				<div class="integration__main">
					<span class="integration__icon integration__icon--emerald" aria-hidden="true">
						<i class="ri-chat-3-line"></i>
					</span>
					<div class="integration__body">
						<div class="integration__head">
							<h3 class="integration__title">SMS &amp; Phone</h3>
							{#if smsState === 'active'}
								<span class="integration__status integration__status--ok">Active</span>
							{:else if smsState === 'pending'}
								<span class="integration__status integration__status--pending"
									>Pending approval</span
								>
							{:else if smsState === 'disabled'}
								<span class="integration__status integration__status--muted">Disabled</span>
							{:else if smsState === 'unsupported'}
								<span class="integration__status integration__status--muted">Unavailable</span>
							{/if}
						</div>
						<p class="integration__desc">
							{#if smsState === 'disabled'}
								SMS is currently disabled. Contact your account manager.
							{:else if smsState === 'unsupported'}
								SMS is not available in your region yet.
							{:else if smsState === 'no_number'}
								Set up a business number to send and receive texts and calls.
							{:else if smsState === 'pending'}
								{o.twilio_phone_number} · Active for calls and incoming texts. Outbound SMS unlocks after
								carrier approval (5–10 business days).
							{:else}
								{o.twilio_phone_number} · Texting and calling are fully active.
							{/if}
						</p>
					</div>
					{#if smsState === 'no_number'}
						<div class="integration__action">
							<Button onclick={() => (showSetup = !showSetup)}>
								{showSetup ? 'Cancel' : 'Set up business number'}
							</Button>
						</div>
					{/if}
				</div>

				{#if smsState === 'no_number' && showSetup}
					<div class="integration__expand">
						<form class="num-setup" onsubmit={searchNumbers}>
							<div class="num-setup__search">
								<div class="field num-setup__field">
									<label class="field__label" for="sms_postal_code">ZIP / Postal code</label>
									<input
										id="sms_postal_code"
										class="field__input"
										type="text"
										inputmode="text"
										autocomplete="postal-code"
										placeholder="78701"
										bind:value={postalCode}
										disabled={searching || purchasing}
									/>
								</div>
								<Button
									type="submit"
									variant="outline"
									disabled={postalCode.trim().length < 2}
									loading={searching || purchasing}
									loadingLabel="Searching…">Search</Button
								>
							</div>

							{#if postalError}
								<p class="num-setup__error">{postalError}</p>
							{/if}
							{#if phoneError}
								<p class="num-setup__error">{phoneError}</p>
							{/if}

							{#if searched && numbers.length === 0}
								<p class="num-setup__empty">
									No numbers available for that area. Try a different ZIP / postal code.
								</p>
							{:else if numbers.length > 0}
								<fieldset class="num-setup__list">
									<legend class="sr-only">Available numbers</legend>
									{#each numbers as num (num.phoneNumber)}
										<label
											class="num-setup__opt"
											class:num-setup__opt--selected={selectedNumber === num.phoneNumber}
										>
											<input
												type="radio"
												name="sms_phone_number"
												value={num.phoneNumber}
												bind:group={selectedNumber}
												disabled={purchasing}
											/>
											<span class="num-setup__opt-main">
												<span class="num-setup__opt-number">{num.friendlyName}</span>
												{#if num.locality || num.region}
													<span class="num-setup__opt-loc">
														{[num.locality, num.region].filter(Boolean).join(', ')}
													</span>
												{/if}
											</span>
										</label>
									{/each}
									<Button
										class="btn--full"
										disabled={!selectedNumber}
										loading={purchasing}
										loadingLabel="Setting up your number…"
										onclick={purchaseNumber}
									>
										Get this number
									</Button>
								</fieldset>
							{/if}
							<p class="num-setup__hint">
								One number per organization{o.country
									? ` · ${countryName(o.country) ?? o.country}`
									: ''}.
							</p>
						</form>
					</div>
				{/if}

				{#if showCarrierSection}
					<div class="integration__expand">
						{#if !carrierComplete && !carrierEditing}
							<!-- Skipped state — carrier details never submitted. -->
							<div class="carrier-prompt">
								<div class="carrier-prompt__row">
									<i class="ri-error-warning-line carrier-prompt__icon" aria-hidden="true"></i>
									<div>
										<p class="carrier-prompt__title">Finish carrier registration</p>
										<p class="carrier-prompt__text">
											Outbound texting stays off until you submit your business details for
											{o.country === 'CA' ? 'CWTA' : '10DLC'} registration.
										</p>
									</div>
								</div>
								<div>
									<Button onclick={openCarrierForm}>Complete carrier registration</Button>
								</div>
							</div>
						{:else if carrierComplete && !carrierEditing}
							<!-- Submitted — details on file, awaiting carrier approval. -->
							<div class="carrier-summary">
								<div class="carrier-summary__head">
									<span class="carrier-summary__status">
										<i class="ri-check-line" aria-hidden="true"></i>
										Carrier details submitted — under review
									</span>
									<Button variant="outline" size="sm" onclick={openCarrierForm}>
										Edit details
									</Button>
								</div>
								<dl class="carrier-summary__grid">
									<div>
										<dt class="carrier-summary__dt">
											{o.country === 'CA' ? 'Business name' : 'Legal business name'}
										</dt>
										<dd class="carrier-summary__dd">{o.legal_business_name}</dd>
									</div>
									{#if o.country === 'US'}
										<div>
											<dt class="carrier-summary__dt">EIN</dt>
											<dd class="carrier-summary__dd">{o.ein}</dd>
										</div>
										<div>
											<dt class="carrier-summary__dt">Website</dt>
											<dd class="carrier-summary__dd">{o.website}</dd>
										</div>
										<div class="carrier-summary__full">
											<dt class="carrier-summary__dt">Messaging use case</dt>
											<dd class="carrier-summary__dd">{o.messaging_use_case}</dd>
										</div>
									{:else}
										<div>
											<dt class="carrier-summary__dt">Business Number</dt>
											<dd class="carrier-summary__dd">{o.business_number}</dd>
										</div>
									{/if}
								</dl>
							</div>
						{:else}
							<!-- Editing — country-aware form, mirrors the onboarding carrier step. -->
							<form class="carrier-form" onsubmit={submitCarrier}>
								<div class="field">
									<label class="field__label field__label--required" for="carrier_legal_name">
										{o.country === 'CA' ? 'Business name' : 'Legal business name'}
									</label>
									<input
										id="carrier_legal_name"
										class="field__input"
										type="text"
										autocomplete="organization"
										placeholder="As registered with the government"
										required
										bind:value={legalBusinessName}
										disabled={carrierSubmitting}
									/>
									{#if carrierFieldErrors.legal_business_name}
										<p class="field__error">{carrierFieldErrors.legal_business_name}</p>
									{/if}
								</div>

								{#if o.country === 'US'}
									<div class="field">
										<label class="field__label field__label--required" for="carrier_ein">EIN</label>
										<input
											id="carrier_ein"
											class="field__input"
											type="text"
											inputmode="numeric"
											placeholder="12-3456789"
											required
											bind:value={ein}
											disabled={carrierSubmitting}
										/>
										{#if carrierFieldErrors.ein}
											<p class="field__error">{carrierFieldErrors.ein}</p>
										{/if}
									</div>

									<div class="field">
										<label class="field__label field__label--required" for="carrier_website">
											Website
										</label>
										<input
											id="carrier_website"
											class="field__input"
											type="text"
											inputmode="url"
											autocomplete="url"
											placeholder="https://yourbusiness.com"
											required
											bind:value={website}
											disabled={carrierSubmitting}
										/>
										{#if carrierFieldErrors.website}
											<p class="field__error">{carrierFieldErrors.website}</p>
										{/if}
									</div>

									<div class="field">
										<label class="field__label field__label--required" for="carrier_use_case">
											Messaging use case
										</label>
										<textarea
											id="carrier_use_case"
											class="field__textarea"
											rows={3}
											placeholder="How will you use texting? e.g. appointment reminders, quote follow-ups, and replies to customer enquiries."
											required
											bind:value={messagingUseCase}
											disabled={carrierSubmitting}
										></textarea>
										{#if carrierFieldErrors.messaging_use_case}
											<p class="field__error">{carrierFieldErrors.messaging_use_case}</p>
										{/if}
									</div>
								{:else}
									<div class="field">
										<label
											class="field__label field__label--required"
											for="carrier_business_number"
										>
											Business Number
										</label>
										<input
											id="carrier_business_number"
											class="field__input"
											type="text"
											inputmode="numeric"
											placeholder="9-digit CRA Business Number"
											required
											bind:value={businessNumber}
											disabled={carrierSubmitting}
										/>
										{#if carrierFieldErrors.business_number}
											<p class="field__error">{carrierFieldErrors.business_number}</p>
										{/if}
									</div>
								{/if}

								{#if carrierError}
									<p class="num-setup__error">{carrierError}</p>
								{/if}

								<div class="carrier-form__actions">
									<Button type="submit" loading={carrierSubmitting} loadingLabel="Submitting…">
										Submit for review
									</Button>
									<Button
										variant="outline"
										disabled={carrierSubmitting}
										onclick={() => (carrierEditing = false)}
									>
										Cancel
									</Button>
								</div>
							</form>
						{/if}
					</div>
				{/if}
			</section>
		</div>
	{/if}
</PageWrapper>
