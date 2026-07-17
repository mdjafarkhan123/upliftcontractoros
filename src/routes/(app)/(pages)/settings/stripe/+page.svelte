<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import StripeConnectionCard from '$lib/components/settings/StripeConnectionCard.svelte';
	import StripeSetupGuide from '$lib/components/settings/StripeSetupGuide.svelte';
	import StripeTestInvoice from '$lib/components/settings/StripeTestInvoice.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getOrgContext } from '$lib/context/org';
	import { sessionStore } from '$lib/stores/session.svelte';

	type StripeStatus = {
		stripe_restricted_key_masked: string | null;
		stripe_publishable_key: string | null;
		stripe_webhook_secret_masked: string | null;
		stripe_account_id: string | null;
		stripe_account_name: string | null;
		stripe_account_email: string | null;
		stripe_livemode: boolean | null;
		stripe_connected_at: string | null;
		stripe_last_verified_at: string | null;
		is_connected: boolean;
	};

	const member = getMemberContext();
	const org = getOrgContext();
	let m = $derived(member());
	let o = $derived(org());

	let status = $state<StripeStatus | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let disconnecting = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	let form = $state({
		stripe_restricted_key: '',
		stripe_publishable_key: '',
		stripe_webhook_secret: ''
	});

	type KeyHint = { ok: boolean; text: string } | null;

	function keyMode(val: string): 'live' | 'test' | null {
		if (val.includes('_live_')) return 'live';
		if (val.includes('_test_')) return 'test';
		return null;
	}

	function rkHint(val: string): KeyHint {
		if (!val) return null;
		if (val.startsWith('rk_live_'))
			return { ok: true, text: 'Live mode key — ready for real customers' };
		if (val.startsWith('rk_test_'))
			return { ok: true, text: 'Test mode key — no real money moves, safe for testing' };
		if (val.startsWith('pk_'))
			return {
				ok: false,
				text: 'That\'s your publishable key — paste it in the "Publishable key" field below'
			};
		if (val.startsWith('sk_'))
			return {
				ok: false,
				text: "That's a full secret key — please create a restricted key instead (see step 3 in the guide above). It's safer."
			};
		if (val.startsWith('whsec_'))
			return {
				ok: false,
				text: 'That\'s your webhook secret — paste it in the "Webhook signing secret" field below'
			};
		return { ok: false, text: 'Should start with rk_live_ or rk_test_' };
	}

	function pkHint(val: string): KeyHint {
		if (!val) return null;
		if (val.startsWith('pk_live_')) return { ok: true, text: 'Live mode publishable key' };
		if (val.startsWith('pk_test_')) return { ok: true, text: 'Test mode publishable key' };
		if (val.startsWith('rk_') || val.startsWith('sk_'))
			return {
				ok: false,
				text: 'That\'s a secret/restricted key — paste it in the "Restricted key" field above'
			};
		if (val.startsWith('whsec_'))
			return {
				ok: false,
				text: 'That\'s your webhook secret — paste it in the "Webhook signing secret" field below'
			};
		return { ok: false, text: 'Should start with pk_live_ or pk_test_' };
	}

	function wsHint(val: string): KeyHint {
		if (!val) return null;
		if (val.startsWith('whsec_')) return { ok: true, text: 'Webhook signing secret looks good' };
		if (val.startsWith('rk_') || val.startsWith('sk_') || val.startsWith('pk_'))
			return {
				ok: false,
				text: 'That\'s an API key, not a webhook secret — go to step 5 in the guide above and click "Reveal" next to "Signing secret"'
			};
		return { ok: false, text: 'Should start with whsec_' };
	}

	let rkValidation = $derived(rkHint(form.stripe_restricted_key));
	let pkValidation = $derived(pkHint(form.stripe_publishable_key));
	let wsValidation = $derived(wsHint(form.stripe_webhook_secret));

	let modeMismatch = $derived(
		keyMode(form.stripe_restricted_key) !== null &&
			keyMode(form.stripe_publishable_key) !== null &&
			keyMode(form.stripe_restricted_key) !== keyMode(form.stripe_publishable_key)
	);

	let webhookUrl = $derived(
		typeof window !== 'undefined'
			? `${window.location.origin}/api/webhooks/stripe?org_id=${o.id}`
			: `/api/webhooks/stripe?org_id=${o.id}`
	);

	onMount(() => {
		if (m.role !== 'admin') {
			goto('/settings');
			return;
		}
		void load();
	});

	async function load() {
		loading = true;
		try {
			const res = await fetch('/api/settings/stripe');
			const body = (await res.json()) as { data?: StripeStatus; error?: string };
			if (!res.ok || !body.data) {
				toast.error(body.error ?? 'Failed to load Stripe settings');
				return;
			}
			status = body.data;
		} finally {
			loading = false;
		}
	}

	async function save() {
		saving = true;
		fieldErrors = {};
		try {
			const res = await fetch('/api/settings/stripe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});
			const body = (await res.json()) as {
				data?: StripeStatus;
				error?: string;
				field_errors?: Record<string, string>;
			};
			if (!res.ok) {
				fieldErrors = body.field_errors ?? {};
				toast.error(body.error ?? 'Save failed');
				return;
			}
			if (body.data) {
				status = body.data;
				form = {
					stripe_restricted_key: '',
					stripe_publishable_key: '',
					stripe_webhook_secret: ''
				};
				toast.success(
					body.data.stripe_livemode
						? 'Stripe connected · live mode'
						: 'Stripe connected · test mode'
				);
			}
		} catch {
			toast.error('Save failed');
		} finally {
			saving = false;
		}
	}

	async function disconnect() {
		if (
			!window.confirm(
				'Disconnect Stripe? Customers won’t be able to pay invoices online until you reconnect.'
			)
		) {
			return;
		}
		disconnecting = true;
		try {
			const res = await fetch('/api/settings/stripe', { method: 'DELETE' });
			if (!res.ok) {
				toast.error('Disconnect failed');
				return;
			}
			toast.success('Stripe disconnected');
			void load();
		} finally {
			disconnecting = false;
		}
	}

	// --- Invoice tips (M7) --- seed once from the raw org getter (not the derived `o`, which
	// would flag a state_referenced_locally warning for a one-time initializer).
	let tipsEnabled = $state(org().tips_enabled ?? false);
	let tipPresets = $state<number[]>([...(org().tip_preset_percents ?? [10, 15, 20])]);
	let presetInput = $state('');
	let tipsSaving = $state(false);

	function addPreset() {
		const n = Number(presetInput.trim());
		if (!Number.isInteger(n) || n < 1 || n > 100) {
			toast.error('Enter a whole percent between 1 and 100');
			return;
		}
		if (tipPresets.includes(n)) {
			presetInput = '';
			return;
		}
		if (tipPresets.length >= 4) {
			toast.error('Up to 4 presets');
			return;
		}
		tipPresets = [...tipPresets, n].sort((a, b) => a - b);
		presetInput = '';
	}

	function removePreset(pct: number) {
		if (tipPresets.length <= 1) {
			toast.error('Keep at least one preset');
			return;
		}
		tipPresets = tipPresets.filter((p) => p !== pct);
	}

	async function saveTips() {
		tipsSaving = true;
		try {
			const res = await fetch('/api/settings/org', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tips_enabled: tipsEnabled, tip_preset_percents: tipPresets })
			});
			const body = (await res.json()) as { error?: string };
			if (!res.ok) {
				toast.error(body.error ?? 'Could not save tips settings');
				return;
			}
			toast.success('Tips settings saved');
			// Refresh the session so the org context (and every tip gate) reflects the change now.
			void sessionStore.load(true);
		} catch {
			toast.error('Could not save tips settings');
		} finally {
			tipsSaving = false;
		}
	}

	// --- Invoice late fees (M8) --- seed once from the raw org getter. Amounts arrive as numeric
	// strings from the DB; edited as plain string inputs and sent back as numbers.
	let lateFeeEnabled = $state(org().late_fee_enabled ?? false);
	let lateFeeType = $state<'flat' | 'percent'>(
		(org().late_fee_type as 'flat' | 'percent') ?? 'percent'
	);
	let lateFeeFlat = $state(org().late_fee_flat_amount ?? '');
	let lateFeePercent = $state(org().late_fee_percent ?? '');
	// Grace period (M8 Phase 2): days past due before the fee auto-applies. Seeded from the org.
	let lateFeeGraceDays = $state(String(org().late_fee_grace_days ?? 3));
	let lateFeeSaving = $state(false);

	async function saveLateFees() {
		const grace = Math.trunc(Number(lateFeeGraceDays));
		if (lateFeeEnabled && (!Number.isFinite(grace) || grace < 0 || grace > 60)) {
			toast.error('Grace period must be between 0 and 60 days');
			return;
		}
		const payload: Record<string, unknown> = {
			late_fee_enabled: lateFeeEnabled,
			late_fee_type: lateFeeType,
			late_fee_grace_days: Number.isFinite(grace) ? Math.max(0, Math.min(60, grace)) : 3
		};
		if (lateFeeType === 'flat') {
			const v = Number(lateFeeFlat);
			if (lateFeeEnabled && (!Number.isFinite(v) || v <= 0)) {
				toast.error('Enter a flat fee amount greater than 0');
				return;
			}
			payload.late_fee_flat_amount = Number.isFinite(v) && v > 0 ? v : null;
		} else {
			const v = Number(lateFeePercent);
			if (lateFeeEnabled && (!Number.isFinite(v) || v <= 0)) {
				toast.error('Enter a percentage greater than 0');
				return;
			}
			payload.late_fee_percent = Number.isFinite(v) && v > 0 ? v : null;
		}
		lateFeeSaving = true;
		try {
			const res = await fetch('/api/settings/org', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = (await res.json()) as { error?: string };
			if (!res.ok) {
				toast.error(body.error ?? 'Could not save late fee settings');
				return;
			}
			toast.success('Late fee settings saved');
			void sessionStore.load(true);
		} catch {
			toast.error('Could not save late fee settings');
		} finally {
			lateFeeSaving = false;
		}
	}

	function handleVerified(next: {
		livemode: boolean;
		stripe_account_id: string | null;
		stripe_account_name: string | null;
		stripe_account_email: string | null;
		stripe_last_verified_at: string;
	}) {
		if (!status) return;
		status = {
			...status,
			stripe_livemode: next.livemode,
			stripe_account_id: next.stripe_account_id,
			stripe_account_name: next.stripe_account_name,
			stripe_account_email: next.stripe_account_email,
			stripe_last_verified_at: next.stripe_last_verified_at
		};
	}
</script>

<svelte:head><title>Stripe Settings</title></svelte:head>

<PageWrapper
	title="Online payments"
	subtitle="Get paid by card on every invoice you send."
	back="/settings/integrations"
>
	{#if loading || !status}
		<SkeletonLoader lines={6} label="Loading Stripe settings" height="64px" />
	{:else}
		<div class="stripe-page">
			<StripeConnectionCard
				isConnected={status.is_connected}
				restrictedKeyMasked={status.stripe_restricted_key_masked}
				publishableKey={status.stripe_publishable_key}
				webhookSecretMasked={status.stripe_webhook_secret_masked}
				accountId={status.stripe_account_id}
				accountName={status.stripe_account_name}
				accountEmail={status.stripe_account_email}
				livemode={status.stripe_livemode}
				connectedAt={status.stripe_connected_at}
				lastVerifiedAt={status.stripe_last_verified_at}
				{webhookUrl}
				onVerified={handleVerified}
			/>

			{#if status.is_connected && status.stripe_livemode === false}
				<StripeTestInvoice defaultEmail={m.email} />
			{/if}

			<StripeSetupGuide {webhookUrl} defaultOpen={!status.is_connected} />

			<form
				class="stripe-form"
				onsubmit={(e) => {
					e.preventDefault();
					void save();
				}}
			>
				<header>
					<h3 class="stripe-form__title">
						{status.is_connected ? 'Update your Stripe keys' : 'Paste your Stripe keys'}
					</h3>
					<p class="stripe-form__desc">
						We'll test the connection with Stripe before saving anything.
					</p>
				</header>

				<div class="field">
					<label class="field__label field__label--required" for="rk">Restricted key</label>
					<input
						class="field__input"
						id="rk"
						type="password"
						autocomplete="off"
						placeholder="rk_live_… or rk_test_…"
						bind:value={form.stripe_restricted_key}
						required
					/>
					{#if fieldErrors.stripe_restricted_key}
						<p class="field__error">{fieldErrors.stripe_restricted_key}</p>
					{:else if rkValidation}
						<p
							class="stripe-form__hint {rkValidation.ok
								? 'stripe-form__hint--ok'
								: 'stripe-form__hint--warn'}"
						>
							{rkValidation.ok ? '✓' : '⚠'}
							{rkValidation.text}
						</p>
					{/if}
				</div>

				<div class="field">
					<label class="field__label field__label--required" for="pk">Publishable key</label>
					<input
						class="field__input"
						id="pk"
						placeholder="pk_live_… or pk_test_…"
						bind:value={form.stripe_publishable_key}
						required
					/>
					{#if fieldErrors.stripe_publishable_key}
						<p class="field__error">{fieldErrors.stripe_publishable_key}</p>
					{:else if pkValidation}
						<p
							class="stripe-form__hint {pkValidation.ok
								? 'stripe-form__hint--ok'
								: 'stripe-form__hint--warn'}"
						>
							{pkValidation.ok ? '✓' : '⚠'}
							{pkValidation.text}
						</p>
					{/if}
				</div>

				{#if modeMismatch}
					<div class="stripe-form__mismatch">
						<strong>Mode mismatch:</strong> Your restricted key is {keyMode(
							form.stripe_restricted_key
						)}
						mode but your publishable key is {keyMode(form.stripe_publishable_key)} mode. Both keys must
						be the same mode — either both live or both test.
					</div>
				{/if}

				<div class="field">
					<label class="field__label field__label--required" for="ws">Webhook signing secret</label>
					<input
						class="field__input"
						id="ws"
						type="password"
						autocomplete="off"
						placeholder="whsec_…"
						bind:value={form.stripe_webhook_secret}
						required
					/>
					{#if fieldErrors.stripe_webhook_secret}
						<p class="field__error">{fieldErrors.stripe_webhook_secret}</p>
					{:else if wsValidation}
						<p
							class="stripe-form__hint {wsValidation.ok
								? 'stripe-form__hint--ok'
								: 'stripe-form__hint--warn'}"
						>
							{wsValidation.ok ? '✓' : '⚠'}
							{wsValidation.text}
						</p>
					{/if}
				</div>

				<footer class="stripe-form__footer">
					{#if status.is_connected}
						<Button
							variant="destructive"
							loading={disconnecting}
							loadingLabel="Disconnecting…"
							onclick={disconnect}
						>
							Disconnect Stripe
						</Button>
					{/if}
					<Button type="submit" loading={saving} loadingLabel="Testing connection…">
						{status.is_connected ? 'Save changes' : 'Connect Stripe'}
					</Button>
				</footer>
			</form>

			<section class="tips-card">
				<header class="tips-card__head">
					<div>
						<h3 class="tips-card__title">Invoice tips</h3>
						<p class="tips-card__desc">
							Let customers add a tip when they pay online, and log tips on cash or check payments.
							Tips are extra — they never change the invoice balance.
						</p>
					</div>
					<Switch bind:checked={tipsEnabled} disabled={tipsSaving} />
				</header>

				{#if tipsEnabled}
					<div class="tips-card__presets">
						<span class="tips-card__label">Percentage presets shown on the pay page</span>
						<div class="tips-card__chips">
							{#each tipPresets as pct (pct)}
								<span class="tips-card__chip">
									{pct}%
									<button
										type="button"
										class="tips-card__chip-remove"
										aria-label="Remove {pct}% preset"
										onclick={() => removePreset(pct)}
										disabled={tipsSaving}
									>
										<i class="ri-close-line" aria-hidden="true"></i>
									</button>
								</span>
							{/each}
						</div>
						{#if tipPresets.length < 4}
							<div class="tips-card__add">
								<input
									class="field__input tips-card__add-input"
									type="number"
									inputmode="numeric"
									min="1"
									max="100"
									placeholder="e.g. 25"
									bind:value={presetInput}
									disabled={tipsSaving}
									onkeydown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											addPreset();
										}
									}}
								/>
								<Button variant="outline" disabled={tipsSaving} onclick={addPreset}>Add %</Button>
							</div>
						{/if}
					</div>
				{/if}

				<footer class="tips-card__footer">
					<Button loading={tipsSaving} loadingLabel="Saving…" onclick={saveTips}>
						Save tips settings
					</Button>
				</footer>
			</section>

			<section class="tips-card">
				<header class="tips-card__head">
					<div>
						<h3 class="tips-card__title">Late fees</h3>
						<p class="tips-card__desc">
							Charge a fee on overdue invoices — applied automatically after a grace period, or by
							hand from any overdue invoice. Each new invoice starts from these defaults and can be
							changed per invoice. A late fee is real money — it's added to the balance owed.
						</p>
					</div>
					<Switch bind:checked={lateFeeEnabled} disabled={lateFeeSaving} />
				</header>

				{#if lateFeeEnabled}
					<div class="tips-card__presets">
						<span class="tips-card__label">Fee type</span>
						<div class="late-fee__types">
							<label class="late-fee__type">
								<input
									type="radio"
									bind:group={lateFeeType}
									value="percent"
									disabled={lateFeeSaving}
								/>
								Percentage of balance
							</label>
							<label class="late-fee__type">
								<input
									type="radio"
									bind:group={lateFeeType}
									value="flat"
									disabled={lateFeeSaving}
								/>
								Flat amount
							</label>
						</div>

						{#if lateFeeType === 'percent'}
							<div class="tips-card__add">
								<input
									class="field__input tips-card__add-input"
									type="number"
									inputmode="decimal"
									min="0"
									max="100"
									step="0.01"
									placeholder="e.g. 5"
									bind:value={lateFeePercent}
									disabled={lateFeeSaving}
								/>
								<span class="late-fee__unit">% of the unpaid balance</span>
							</div>
						{:else}
							<div class="tips-card__add">
								<span class="late-fee__unit">$</span>
								<input
									class="field__input tips-card__add-input"
									type="number"
									inputmode="decimal"
									min="0"
									step="0.01"
									placeholder="e.g. 25"
									bind:value={lateFeeFlat}
									disabled={lateFeeSaving}
								/>
							</div>
						{/if}

						<span class="tips-card__label">Grace period</span>
						<div class="tips-card__add">
							<input
								class="field__input tips-card__add-input"
								type="number"
								inputmode="numeric"
								min="0"
								max="60"
								step="1"
								placeholder="e.g. 3"
								bind:value={lateFeeGraceDays}
								disabled={lateFeeSaving}
							/>
							<span class="late-fee__unit">days after the due date before the fee applies</span>
						</div>
						<p class="tips-card__desc">
							Overdue invoices are charged the fee automatically once this many days have passed —
							or you can add it by hand from any overdue invoice. Set to 0 to charge the day after
							it's due.
						</p>
					</div>
				{/if}

				<footer class="tips-card__footer">
					<Button loading={lateFeeSaving} loadingLabel="Saving…" onclick={saveLateFees}>
						Save late fee settings
					</Button>
				</footer>
			</section>
		</div>
	{/if}
</PageWrapper>
