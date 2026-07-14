<script lang="ts">
	import PlanTemplateSelector from '$lib/components/jafar/PlanTemplateSelector.svelte';
	import FeatureFlagsEditor from '$lib/components/jafar/FeatureFlagsEditor.svelte';
	import LimitsEditor from '$lib/components/jafar/LimitsEditor.svelte';
	import type { PlanName, PlanTemplate } from '$lib/admin/planTemplates';
	import type { FeatureFlags, OrgLimits } from '$lib/types';
	import type { Org } from '$lib/stores/jafarOrg.svelte';

	let {
		org,
		orgId,
		plan = $bindable<PlanName>('starter'),
		flags = $bindable<FeatureFlags>({} as FeatureFlags),
		limits = $bindable<OrgLimits>({} as OrgLimits),
		onTemplateApplied,
		onCopy
	}: {
		org: Org;
		orgId: string;
		plan?: PlanName;
		flags?: FeatureFlags;
		limits?: OrgLimits;
		onTemplateApplied?: () => void;
		onCopy?: (value: string, key: string) => void;
	} = $props();

	function applyTemplate(t: PlanTemplate) {
		plan = t.plan;
		flags = { ...t.flags };
		limits = { ...t.limits };
		onTemplateApplied?.();
	}

	// ── Webchat widget config (only mounted when feature_webchat is on) ────
	interface WidgetConfig {
		id?: string;
		display_name: string;
		intro_message: string;
		offline_message: string;
		webchat_mode: 'instant' | 'asynchronous';
		domain_allowlist: string[];
		is_active: boolean;
	}
	let webchatWidget = $state<WidgetConfig | null>(null);
	let webchatToken = $state<string | null>(null);
	let webchatLoading = $state(false);
	let webchatSaving = $state(false);
	let webchatError = $state('');
	let webchatSaved = $state(false);
	let newDomain = $state('');
	let copied = $state<string | null>(null);

	async function loadWebchatWidget(id: string) {
		webchatLoading = true;
		webchatError = '';
		try {
			const res = await fetch(`/api/admin/orgs/${id}/webchat-widget`);
			if (!res.ok) throw new Error('Failed to load widget config');
			const body = (await res.json()) as {
				data: { widget: WidgetConfig | null; widget_token: string };
			};
			webchatToken = body.data.widget_token;
			webchatWidget = body.data.widget ?? {
				display_name: '',
				intro_message: "We'll text you back — no robocalls, just a real person from our team.",
				offline_message:
					"We're currently on site helping customers. Leave your details and we'll reply as soon as possible.",
				webchat_mode: 'asynchronous',
				domain_allowlist: [],
				is_active: true
			};
		} catch (e) {
			webchatError = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			webchatLoading = false;
		}
	}

	async function saveWebchatWidget() {
		if (!webchatWidget || webchatSaving) return;
		webchatSaving = true;
		webchatError = '';
		webchatSaved = false;
		try {
			const res = await fetch(`/api/admin/orgs/${orgId}/webchat-widget`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(webchatWidget)
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? 'Save failed');
			}
			webchatSaved = true;
			setTimeout(() => {
				webchatSaved = false;
			}, 3000);
		} catch (e) {
			webchatError = e instanceof Error ? e.message : 'Save failed';
		} finally {
			webchatSaving = false;
		}
	}

	function addDomain() {
		if (!webchatWidget || !newDomain.trim()) return;
		const domain = newDomain.trim();
		if (!webchatWidget.domain_allowlist.includes(domain)) {
			webchatWidget.domain_allowlist = [...webchatWidget.domain_allowlist, domain];
		}
		newDomain = '';
	}

	function removeDomain(d: string) {
		if (!webchatWidget) return;
		webchatWidget.domain_allowlist = webchatWidget.domain_allowlist.filter((x) => x !== d);
	}

	function buildEmbedSnippet(token: string): string {
		const origin = typeof window !== 'undefined' ? window.location.origin : '';
		const open = '<' + 'script';
		const close = '<' + '/script>';
		return `${open}\n  src="${origin}/webchat-widget.js"\n  data-widget-token="${token}"\n  defer\n>${close}`;
	}
	const embedSnippet = $derived(webchatToken ? buildEmbedSnippet(webchatToken) : '');

	$effect(() => {
		if (org.feature_webchat && orgId) {
			void loadWebchatWidget(orgId);
		}
	});

	// ── SMS credit (always shown — core infra for every org) ───────────────
	interface CreditState {
		balance: number;
		monthly_included_credit: number;
		per_sms_cost: number;
		last_monthly_grant_at: string | null;
		show_cost_to_contractor: boolean;
	}
	interface LedgerRow {
		id: string;
		entry_type: 'charge' | 'refund' | 'manual_topup' | 'monthly_grant';
		amount: string;
		balance_after: string;
		note: string | null;
		created_at: string;
	}
	let credit = $state<CreditState | null>(null);
	let ledger = $state<LedgerRow[]>([]);
	let creditLoading = $state(false);
	let creditError = $state('');
	let creditSaving = $state(false);
	let creditSaved = $state(false);
	// Editable config (seeded after load).
	let perSmsCost = $state(0);
	let monthlyCredit = $state(0);
	let phoneNumber = $state('');
	let showCostToContractor = $state(false);
	// Manual top-up.
	let topupAmount = $state<number | null>(null);
	let topupNote = $state('');
	let topupSaving = $state(false);
	let topupError = $state('');

	function seedCreditForm() {
		if (!credit) return;
		perSmsCost = credit.per_sms_cost;
		monthlyCredit = credit.monthly_included_credit;
		phoneNumber = org.twilio_phone_number ?? '';
		showCostToContractor = credit.show_cost_to_contractor;
	}

	async function loadCredit(id: string) {
		creditLoading = true;
		creditError = '';
		try {
			const res = await fetch(`/api/admin/orgs/${id}/sms-credit`);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? 'Failed to load SMS credit');
			}
			const body = (await res.json()) as { data: { credit: CreditState; ledger: LedgerRow[] } };
			credit = body.data.credit;
			ledger = body.data.ledger;
			seedCreditForm();
		} catch (e) {
			creditError = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			creditLoading = false;
		}
	}

	async function saveCreditConfig() {
		if (creditSaving) return;
		creditSaving = true;
		creditError = '';
		creditSaved = false;
		try {
			const res = await fetch(`/api/admin/orgs/${orgId}/sms-credit`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					per_sms_cost: perSmsCost,
					monthly_included_credit: monthlyCredit,
					show_cost_to_contractor: showCostToContractor,
					twilio_phone_number: phoneNumber.trim()
				})
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error ?? 'Save failed');
			credit = body.data.credit;
			seedCreditForm();
			creditSaved = true;
			setTimeout(() => (creditSaved = false), 3000);
		} catch (e) {
			creditError = e instanceof Error ? e.message : 'Save failed';
		} finally {
			creditSaving = false;
		}
	}

	async function applyTopup() {
		if (topupSaving || !topupAmount || topupAmount <= 0) return;
		topupSaving = true;
		topupError = '';
		try {
			const res = await fetch(`/api/admin/orgs/${orgId}/sms-credit`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ amount: topupAmount, note: topupNote.trim() || undefined })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error ?? 'Top-up failed');
			topupAmount = null;
			topupNote = '';
			await loadCredit(orgId);
		} catch (e) {
			topupError = e instanceof Error ? e.message : 'Top-up failed';
		} finally {
			topupSaving = false;
		}
	}

	const ledgerLabels: Record<LedgerRow['entry_type'], string> = {
		charge: 'SMS sent',
		refund: 'Refund',
		manual_topup: 'Manual top-up',
		monthly_grant: 'Monthly grant'
	};

	$effect(() => {
		if (orgId) void loadCredit(orgId);
	});

	async function copyLocal(value: string, key: string) {
		if (onCopy) {
			onCopy(value, key);
			return;
		}
		try {
			await navigator.clipboard.writeText(value);
			copied = key;
			setTimeout(() => {
				if (copied === key) copied = null;
			}, 1500);
		} catch {
			// ignore
		}
	}
</script>

<!-- Plan template -->
<section class="jafar-panel">
	<header class="jafar-panel__head jafar-panel__head--column">
		<h2 class="jafar-panel__title">Plan template</h2>
		<p class="jafar-panel__desc">
			Plan is display metadata. Feature flags below are the real entitlement system.
		</p>
	</header>
	<div class="jafar-panel__body">
		<PlanTemplateSelector bind:value={plan} onApply={applyTemplate} />
	</div>
</section>

<!-- Feature flags -->
<section class="jafar-panel">
	<header class="jafar-panel__head jafar-panel__head--column">
		<h2 class="jafar-panel__title">Feature flags</h2>
		<p class="jafar-panel__desc">
			The authoritative entitlement layer. Disable a flag and the tenant loses the feature — no role
			bypass.
		</p>
	</header>
	<div class="jafar-panel__body">
		<FeatureFlagsEditor bind:flags integrationStatus={org.integration_status ?? {}} />
	</div>
</section>

<!-- Limits -->
<section class="jafar-panel">
	<header class="jafar-panel__head jafar-panel__head--column">
		<h2 class="jafar-panel__title">Usage limits</h2>
		<p class="jafar-panel__desc">
			Hard caps enforced by usage counters. Use 0 for disabled or unlimited where noted.
		</p>
	</header>
	<div class="jafar-panel__body">
		<LimitsEditor bind:limits />
	</div>
</section>

<!-- SMS credit -->
<section class="jafar-panel">
	<header class="jafar-panel__head jafar-panel__head--column">
		<h2 class="jafar-panel__title">SMS credit</h2>
		<p class="jafar-panel__desc">
			Prepaid dollar balance. Every outbound SMS deducts the per-SMS cost; sending is blocked at
			zero. Monthly allowance accumulates on top (rollover). Manual top-ups add to the balance.
		</p>
	</header>

	<div class="jafar-panel__body">
		{#if creditLoading && !credit}
			<p class="jafar-fmsg jafar-fmsg--muted">Loading SMS credit…</p>
		{:else if credit}
			<div class="jafar-credit">
				<!-- Balance -->
				<div class="jafar-subcard jafar-credit__balance">
					<div>
						<p class="jafar-credit__balance-label">Current balance</p>
						<p
							class="jafar-credit__balance-val"
							class:jafar-credit__balance-val--zero={credit.balance <= 0}
						>
							${credit.balance.toFixed(2)}
						</p>
					</div>
					<p class="jafar-credit__balance-meta">
						≈ {credit.per_sms_cost > 0 ? Math.floor(credit.balance / credit.per_sms_cost) : '∞'} messages
						left
						{#if credit.last_monthly_grant_at}
							<br />Last grant: {new Date(credit.last_monthly_grant_at).toLocaleDateString()}
						{/if}
					</p>
				</div>

				<!-- Config -->
				<div class="jafar-credit__config">
					<div class="jafar-credit__field">
						<label class="jafar-flabel" for="sms-cost">Cost per SMS ($)</label>
						<input
							id="sms-cost"
							type="number"
							min="0"
							step="0.0001"
							bind:value={perSmsCost}
							class="jafar-input jafar-input--mono"
						/>
					</div>
					<div class="jafar-credit__field">
						<label class="jafar-flabel" for="sms-monthly">Monthly credit ($)</label>
						<input
							id="sms-monthly"
							type="number"
							min="0"
							step="0.01"
							bind:value={monthlyCredit}
							class="jafar-input jafar-input--mono"
						/>
					</div>
					<div class="jafar-credit__field">
						<label class="jafar-flabel" for="sms-phone">Twilio number</label>
						<input
							id="sms-phone"
							type="tel"
							placeholder="+15551234567"
							bind:value={phoneNumber}
							class="jafar-input jafar-input--mono"
						/>
					</div>
				</div>

				{#if creditError}
					<p class="jafar-fmsg jafar-fmsg--err">{creditError}</p>
				{/if}
				{#if creditSaved}
					<p class="jafar-fmsg jafar-fmsg--ok">SMS credit settings saved.</p>
				{/if}

				<!-- Cost visibility toggle -->
				<label class="jafar-subcard jafar-credit__toggle" for="sms-show-cost">
					<div>
						<p class="jafar-credit__toggle-title">Show per-SMS cost to contractor</p>
						<p class="jafar-credit__toggle-desc">
							When on, this org's Settings → SMS Credits page reveals the per-SMS price and an
							estimated messages-remaining count. Off by default — keep hidden unless the contractor
							needs it.
						</p>
					</div>
					<input
						id="sms-show-cost"
						type="checkbox"
						bind:checked={showCostToContractor}
						class="jafar-checkbox"
					/>
				</label>

				<div class="jafar-credit__actions">
					<button
						type="button"
						onclick={saveCreditConfig}
						disabled={creditSaving}
						class="jafar-btn jafar-btn--red"
					>
						{creditSaving ? 'Saving…' : 'Save SMS settings'}
					</button>
				</div>

				<!-- Manual top-up -->
				<div class="jafar-subcard jafar-credit__topup">
					<p class="jafar-credit__topup-title">Manual top-up</p>
					<p class="jafar-fhint">
						Adds to the existing balance immediately. Use after a contractor requests more credit.
					</p>
					<div class="jafar-credit__topup-form">
						<div class="jafar-credit__field jafar-credit__field--amount">
							<label class="jafar-flabel" for="topup-amount">
								Amount ($) <span class="jafar-flabel__req">*</span>
							</label>
							<input
								id="topup-amount"
								type="number"
								min="0"
								step="0.01"
								bind:value={topupAmount}
								placeholder="10.00"
								class="jafar-input jafar-input--mono"
							/>
						</div>
						<div class="jafar-credit__field jafar-credit__field--grow">
							<label class="jafar-flabel" for="topup-note">Note (optional)</label>
							<input
								id="topup-note"
								type="text"
								bind:value={topupNote}
								placeholder="e.g. WhatsApp request 5/29"
								class="jafar-input"
							/>
						</div>
						<button
							type="button"
							onclick={applyTopup}
							disabled={topupSaving || !topupAmount || topupAmount <= 0}
							class="jafar-btn jafar-btn--emerald"
						>
							{topupSaving ? 'Adding…' : 'Add credit'}
						</button>
					</div>
					{#if topupError}
						<p class="jafar-fmsg jafar-fmsg--err">{topupError}</p>
					{/if}
				</div>

				<!-- Recent ledger -->
				{#if ledger.length > 0}
					<div class="jafar-credit__ledger">
						<p class="jafar-flabel">Recent activity</p>
						<ul class="jafar-credit__ledger-list">
							{#each ledger as row (row.id)}
								{@const amt = Number(row.amount)}
								<li class="jafar-credit__ledger-item">
									<div>
										<p class="jafar-credit__ledger-type">{ledgerLabels[row.entry_type]}</p>
										<p class="jafar-credit__ledger-time">
											{new Date(row.created_at).toLocaleString()}{row.note ? ` · ${row.note}` : ''}
										</p>
									</div>
									<div class="jafar-credit__ledger-right">
										<p
											class="jafar-credit__ledger-amt"
											class:jafar-credit__ledger-amt--neg={amt < 0}
											class:jafar-credit__ledger-amt--pos={amt >= 0}
										>
											{amt < 0 ? '−' : '+'}${Math.abs(amt).toFixed(4)}
										</p>
										<p class="jafar-credit__ledger-bal">
											${Number(row.balance_after).toFixed(2)}
										</p>
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		{:else if creditError}
			<p class="jafar-fmsg jafar-fmsg--err">{creditError}</p>
		{/if}
	</div>
</section>

{#if org.feature_webchat}
	<section class="jafar-panel">
		<header class="jafar-panel__head jafar-panel__head--column">
			<h2 class="jafar-panel__title">Web Chat Widget</h2>
			<p class="jafar-panel__desc">Configure the embeddable chat widget for this org's website.</p>
		</header>

		<div class="jafar-panel__body">
			{#if webchatLoading}
				<p class="jafar-fmsg jafar-fmsg--muted">Loading widget configuration…</p>
			{:else if webchatWidget}
				<div class="jafar-wc">
					<!-- Mode selector -->
					<div class="jafar-wc__field">
						<span class="jafar-flabel">Chat mode</span>
						<div class="jafar-wc__modes">
							{#each [{ value: 'asynchronous', label: 'Asynchronous', hint: 'Visitors leave details, team replies later' }, { value: 'instant', label: 'Instant', hint: 'Implies team is ready to respond quickly' }] as mode (mode.value)}
								<button
									type="button"
									onclick={() => {
										if (webchatWidget)
											webchatWidget.webchat_mode = mode.value as 'instant' | 'asynchronous';
									}}
									class="jafar-wc__mode"
									class:jafar-wc__mode--active={webchatWidget.webchat_mode === mode.value}
								>
									<span class="jafar-wc__mode-name">{mode.label}</span>
									<span class="jafar-wc__mode-hint">{mode.hint}</span>
								</button>
							{/each}
						</div>
					</div>

					<!-- Active toggle -->
					<div class="jafar-subcard jafar-wc__toggle-row">
						<div>
							<p class="jafar-wc__toggle-title">Widget active</p>
							<p class="jafar-wc__toggle-desc">
								When disabled, the widget will not appear on any website.
							</p>
						</div>
						<button
							type="button"
							role="switch"
							aria-checked={webchatWidget.is_active}
							onclick={() => {
								if (webchatWidget) webchatWidget.is_active = !webchatWidget.is_active;
							}}
							class="jafar-toggle"
						>
							<span class="jafar-toggle__knob"></span>
						</button>
					</div>

					<!-- Intro message -->
					<div class="jafar-wc__field">
						<label class="jafar-flabel" for="wc-intro">Intro message</label>
						<textarea
							id="wc-intro"
							rows={3}
							bind:value={webchatWidget.intro_message}
							class="jafar-textarea"
						></textarea>
						<p class="jafar-wc__preview">Preview: "{webchatWidget.intro_message}"</p>
					</div>

					<!-- Offline message -->
					<div class="jafar-wc__field">
						<label class="jafar-flabel" for="wc-offline">Offline message</label>
						<textarea
							id="wc-offline"
							rows={3}
							bind:value={webchatWidget.offline_message}
							class="jafar-textarea"
						></textarea>
						<p class="jafar-wc__preview">Preview: "{webchatWidget.offline_message}"</p>
					</div>

					<!-- Domain allowlist -->
					<div class="jafar-wc__field">
						<span class="jafar-flabel">Domain allowlist</span>
						<p class="jafar-fhint">
							Leave empty to allow all origins. Add full origins like
							<code class="jafar-wc__code">https://example.com</code>.
						</p>
						<div class="jafar-wc__domain-add">
							<input
								type="url"
								bind:value={newDomain}
								placeholder="https://example.com"
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										addDomain();
									}
								}}
								class="jafar-input"
							/>
							<button type="button" onclick={addDomain} class="jafar-btn">Add</button>
						</div>
						{#if webchatWidget.domain_allowlist.length > 0}
							<ul class="jafar-wc__domain-list">
								{#each webchatWidget.domain_allowlist as domain (domain)}
									<li class="jafar-wc__domain-item">
										<code class="jafar-wc__domain-code">{domain}</code>
										<button
											type="button"
											onclick={() => removeDomain(domain)}
											class="jafar-wc__domain-remove"
										>
											Remove
										</button>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="jafar-fhint">No domains added — all origins permitted.</p>
						{/if}
					</div>

					<!-- Widget token (immutable) -->
					<div class="jafar-wc__field">
						<span class="jafar-flabel">Widget token</span>
						<p class="jafar-fhint">Generated once. Immutable. Never editable.</p>
						<div class="jafar-wc__token-row">
							<code class="jafar-wc__token-code">{webchatToken ?? '—'}</code>
							{#if webchatToken}
								<button
									type="button"
									onclick={() => copyLocal(webchatToken!, 'wc-token')}
									class="jafar-copy-chip"
								>
									{copied === 'wc-token' ? 'Copied' : 'Copy'}
								</button>
							{/if}
						</div>
					</div>

					<!-- Embed snippet -->
					<div class="jafar-wc__field">
						<span class="jafar-flabel">Embed snippet</span>
						<p class="jafar-fhint">
							Paste this into the <code class="jafar-wc__code">&lt;head&gt;</code> of the contractor's
							website.
						</p>
						<div class="jafar-wc__snippet">
							<pre class="jafar-wc__snippet-pre">{embedSnippet}</pre>
							<button
								type="button"
								onclick={() => copyLocal(embedSnippet, 'snippet')}
								class="jafar-copy-chip jafar-wc__snippet-copy"
							>
								{copied === 'snippet' ? 'Copied' : 'Copy'}
							</button>
						</div>
					</div>

					{#if webchatError}
						<p class="jafar-fmsg jafar-fmsg--err">{webchatError}</p>
					{/if}
					{#if webchatSaved}
						<p class="jafar-fmsg jafar-fmsg--ok">Widget configuration saved.</p>
					{/if}

					<div class="jafar-wc__actions">
						<button
							type="button"
							onclick={saveWebchatWidget}
							disabled={webchatSaving}
							class="jafar-btn jafar-btn--red"
						>
							{webchatSaving ? 'Saving…' : 'Save widget config'}
						</button>
					</div>
				</div>
			{/if}
		</div>
	</section>
{/if}
