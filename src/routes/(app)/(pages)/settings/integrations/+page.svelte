<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';
	import { getOrgContext } from '$lib/context/org';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { countryName, isSmsSupportedCountry, smsCountrySupport } from '$lib/utils/countries';
	import {
		MessageCircle,
		CreditCard,
		MessageSquare,
		Loader2,
		AlertTriangle,
		Check
	} from '@lucide/svelte';

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

	const carrierInputClass =
		'flex h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60';
	const carrierLabelClass = 'block text-xs font-semibold uppercase tracking-wide text-muted-foreground';

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
				? { legal_business_name: legalBusinessName, ein, website, messaging_use_case: messagingUseCase }
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
		<div class="flex flex-col gap-4">
			<!-- Messenger -->
			<div
				class="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
			>
				<div class="flex items-start gap-4">
					<div
						class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
					>
						<MessageCircle class="h-6 w-6" />
					</div>
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<h3 class="text-base font-semibold text-foreground">Messenger</h3>
							{#if !flags.feature_messenger}
								<span
									class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
								>
									Not on your plan
								</span>
							{:else if messenger?.is_connected}
								<span
									class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
								>
									Connected
								</span>
							{/if}
						</div>
						<p class="mt-0.5 text-sm text-muted-foreground">
							{#if flags.feature_messenger && messenger?.is_connected}
								{messenger.page_name ?? 'Facebook Page'}{messenger.connected_at
									? ` · since ${formatDate(messenger.connected_at)}`
									: ''}
							{:else}
								Reply to Facebook messages from your inbox.
							{/if}
						</p>
					</div>
				</div>
				{#if flags.feature_messenger}
					<div class="shrink-0">
						{#if messenger?.is_connected}
							<Button
								variant="destructive"
								disabled={disconnecting}
								onclick={disconnectMessenger}
							>
								{disconnecting ? 'Disconnecting…' : 'Disconnect'}
							</Button>
						{:else}
							<Button onclick={connectMessenger}>Connect Facebook Page</Button>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Payments -->
			<div
				class="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
			>
				<div class="flex items-start gap-4">
					<div
						class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
					>
						<CreditCard class="h-6 w-6" />
					</div>
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<h3 class="text-base font-semibold text-foreground">Payments</h3>
							{#if !flags.feature_stripe_payments}
								<span
									class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
								>
									Not on your plan
								</span>
							{:else if stripe?.is_connected}
								<span
									class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
								>
									Connected
								</span>
							{/if}
						</div>
						<p class="mt-0.5 text-sm text-muted-foreground">
							Accept card payments on your invoices via Stripe.
						</p>
					</div>
				</div>
				{#if flags.feature_stripe_payments}
					<div class="shrink-0">
						<Button variant="outline" onclick={() => goto('/settings/stripe')}>
							{stripe?.is_connected ? 'Manage' : 'Set up'}
						</Button>
					</div>
				{/if}
			</div>

			<!-- SMS / Phone -->
			<div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
				<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex items-start gap-4">
						<div
							class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
						>
							<MessageSquare class="h-6 w-6" />
						</div>
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<h3 class="text-base font-semibold text-foreground">SMS &amp; Phone</h3>
								{#if smsState === 'active'}
									<span
										class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
									>
										Active
									</span>
								{:else if smsState === 'pending'}
									<span
										class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400"
									>
										Pending approval
									</span>
								{:else if smsState === 'disabled'}
									<span
										class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
									>
										Disabled
									</span>
								{:else if smsState === 'unsupported'}
									<span
										class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
									>
										Unavailable
									</span>
								{/if}
							</div>
							<p class="mt-0.5 text-sm text-muted-foreground">
								{#if smsState === 'disabled'}
									SMS is currently disabled. Contact your account manager.
								{:else if smsState === 'unsupported'}
									SMS is not available in your region yet.
								{:else if smsState === 'no_number'}
									Set up a business number to send and receive texts and calls.
								{:else if smsState === 'pending'}
									{o.twilio_phone_number} · Active for calls and incoming texts. Outbound SMS unlocks
									after carrier approval (5–10 business days).
								{:else}
									{o.twilio_phone_number} · Texting and calling are fully active.
								{/if}
							</p>
						</div>
					</div>
					{#if smsState === 'no_number'}
						<div class="shrink-0">
							<Button onclick={() => (showSetup = !showSetup)}>
								{showSetup ? 'Cancel' : 'Set up business number'}
							</Button>
						</div>
					{/if}
				</div>

				{#if smsState === 'no_number' && showSetup}
					<div class="mt-5 space-y-5 border-t border-border pt-5">
						<form class="flex items-end gap-3" onsubmit={searchNumbers}>
							<div class="flex-1 space-y-1.5">
								<label for="sms_postal_code" class="text-sm font-medium text-foreground">
									ZIP / Postal code
								</label>
								<input
									id="sms_postal_code"
									type="text"
									inputmode="text"
									autocomplete="postal-code"
									placeholder="78701"
									bind:value={postalCode}
									disabled={searching || purchasing}
									class="flex h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
								/>
							</div>
							<Button
								type="submit"
								variant="outline"
								disabled={searching || purchasing || postalCode.trim().length < 2}
							>
								{#if searching}
									<Loader2 class="h-4 w-4 animate-spin" />
									Searching…
								{:else}
									Search
								{/if}
							</Button>
						</form>

						{#if postalError}
							<p class="text-xs text-destructive">{postalError}</p>
						{/if}
						{#if phoneError}
							<p class="text-sm text-destructive">{phoneError}</p>
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
											: 'border-border hover:bg-muted/40'}"
									>
										<input
											type="radio"
											name="sms_phone_number"
											value={num.phoneNumber}
											bind:group={selectedNumber}
											disabled={purchasing}
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
								<Button class="mt-1 w-full" onclick={purchaseNumber} disabled={purchasing || !selectedNumber}>
									{#if purchasing}
										<Loader2 class="h-4 w-4 animate-spin" />
										Setting up your number…
									{:else}
										Get this number
									{/if}
								</Button>
							</fieldset>
						{/if}
						<p class="text-[11px] leading-relaxed text-muted-foreground/70">
							One number per organization{o.country ? ` · ${countryName(o.country) ?? o.country}` : ''}.
						</p>
					</div>
				{/if}

				{#if showCarrierSection}
					<div class="mt-5 border-t border-border pt-5">
						{#if !carrierComplete && !carrierEditing}
							<!-- Skipped state — carrier details never submitted. -->
							<div
								class="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10"
							>
								<div class="flex items-start gap-3">
									<AlertTriangle
										class="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
									/>
									<div class="min-w-0">
										<p class="text-sm font-semibold text-amber-900 dark:text-amber-200">
											Finish carrier registration
										</p>
										<p class="mt-0.5 text-sm text-amber-800/90 dark:text-amber-200/80">
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
							<div class="space-y-4">
								<div class="flex items-center justify-between gap-3">
									<div class="flex items-center gap-2">
										<Check class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
										<span class="text-sm font-medium text-foreground">
											Carrier details submitted — under review
										</span>
									</div>
									<Button variant="outline" onclick={openCarrierForm}>Edit details</Button>
								</div>
								<dl class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
									<div>
										<dt class={carrierLabelClass}>
											{o.country === 'CA' ? 'Business name' : 'Legal business name'}
										</dt>
										<dd class="mt-0.5 text-sm text-foreground">{o.legal_business_name}</dd>
									</div>
									{#if o.country === 'US'}
										<div>
											<dt class={carrierLabelClass}>EIN</dt>
											<dd class="mt-0.5 text-sm text-foreground">{o.ein}</dd>
										</div>
										<div>
											<dt class={carrierLabelClass}>Website</dt>
											<dd class="mt-0.5 break-words text-sm text-foreground">{o.website}</dd>
										</div>
										<div class="sm:col-span-2">
											<dt class={carrierLabelClass}>Messaging use case</dt>
											<dd class="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
												{o.messaging_use_case}
											</dd>
										</div>
									{:else}
										<div>
											<dt class={carrierLabelClass}>Business Number</dt>
											<dd class="mt-0.5 text-sm text-foreground">{o.business_number}</dd>
										</div>
									{/if}
								</dl>
							</div>
						{:else}
							<!-- Editing — country-aware form, mirrors the onboarding carrier step. -->
							<form class="space-y-4" onsubmit={submitCarrier}>
								<div class="space-y-1.5">
									<label for="carrier_legal_name" class={carrierLabelClass}>
										{o.country === 'CA' ? 'Business name' : 'Legal business name'}
										<span class="text-destructive">*</span>
									</label>
									<input
										id="carrier_legal_name"
										type="text"
										autocomplete="organization"
										placeholder="As registered with the government"
										required
										bind:value={legalBusinessName}
										disabled={carrierSubmitting}
										class={carrierInputClass}
									/>
									{#if carrierFieldErrors.legal_business_name}
										<p class="text-xs text-destructive">{carrierFieldErrors.legal_business_name}</p>
									{/if}
								</div>

								{#if o.country === 'US'}
									<div class="space-y-1.5">
										<label for="carrier_ein" class={carrierLabelClass}>
											EIN <span class="text-destructive">*</span>
										</label>
										<input
											id="carrier_ein"
											type="text"
											inputmode="numeric"
											placeholder="12-3456789"
											required
											bind:value={ein}
											disabled={carrierSubmitting}
											class={carrierInputClass}
										/>
										{#if carrierFieldErrors.ein}
											<p class="text-xs text-destructive">{carrierFieldErrors.ein}</p>
										{/if}
									</div>

									<div class="space-y-1.5">
										<label for="carrier_website" class={carrierLabelClass}>
											Website <span class="text-destructive">*</span>
										</label>
										<input
											id="carrier_website"
											type="text"
											inputmode="url"
											autocomplete="url"
											placeholder="https://yourbusiness.com"
											required
											bind:value={website}
											disabled={carrierSubmitting}
											class={carrierInputClass}
										/>
										{#if carrierFieldErrors.website}
											<p class="text-xs text-destructive">{carrierFieldErrors.website}</p>
										{/if}
									</div>

									<div class="space-y-1.5">
										<label for="carrier_use_case" class={carrierLabelClass}>
											Messaging use case <span class="text-destructive">*</span>
										</label>
										<textarea
											id="carrier_use_case"
											rows={3}
											placeholder="How will you use texting? e.g. appointment reminders, quote follow-ups, and replies to customer enquiries."
											required
											bind:value={messagingUseCase}
											disabled={carrierSubmitting}
											class="{carrierInputClass} h-auto py-2.5"
										></textarea>
										{#if carrierFieldErrors.messaging_use_case}
											<p class="text-xs text-destructive">{carrierFieldErrors.messaging_use_case}</p>
										{/if}
									</div>
								{:else}
									<div class="space-y-1.5">
										<label for="carrier_business_number" class={carrierLabelClass}>
											Business Number <span class="text-destructive">*</span>
										</label>
										<input
											id="carrier_business_number"
											type="text"
											inputmode="numeric"
											placeholder="9-digit CRA Business Number"
											required
											bind:value={businessNumber}
											disabled={carrierSubmitting}
											class={carrierInputClass}
										/>
										{#if carrierFieldErrors.business_number}
											<p class="text-xs text-destructive">{carrierFieldErrors.business_number}</p>
										{/if}
									</div>
								{/if}

								{#if carrierError}
									<p class="text-sm text-destructive">{carrierError}</p>
								{/if}

								<div class="flex flex-wrap gap-3">
									<Button type="submit" disabled={carrierSubmitting}>
										{#if carrierSubmitting}
											<Loader2 class="h-4 w-4 animate-spin" />
											Submitting…
										{:else}
											Submit for review
										{/if}
									</Button>
									<Button
										type="button"
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
			</div>
		</div>
	{/if}
</PageWrapper>
