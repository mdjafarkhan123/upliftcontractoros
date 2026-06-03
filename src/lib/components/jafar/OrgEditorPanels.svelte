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
		phoneNumber = org.twilio_phone_number;
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
<section
	class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
>
	<header class="border-b border-slate-800 px-5 py-4">
		<h2 class="text-base font-semibold text-white">Plan template</h2>
		<p class="mt-1 text-sm text-slate-200">
			Plan is display metadata. Feature flags below are the real entitlement system.
		</p>
	</header>
	<div class="px-5 py-5">
		<PlanTemplateSelector bind:value={plan} onApply={applyTemplate} />
	</div>
</section>

<!-- Feature flags -->
<section
	class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
>
	<header class="border-b border-slate-800 px-5 py-4">
		<h2 class="text-base font-semibold text-white">Feature flags</h2>
		<p class="mt-1 text-sm text-slate-200">
			The authoritative entitlement layer. Disable a flag and the tenant loses the feature — no role
			bypass.
		</p>
	</header>
	<div class="px-5 py-5">
		<FeatureFlagsEditor bind:flags integrationStatus={org.integration_status ?? {}} />
	</div>
</section>

<!-- Limits -->
<section
	class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
>
	<header class="border-b border-slate-800 px-5 py-4">
		<h2 class="text-base font-semibold text-white">Usage limits</h2>
		<p class="mt-1 text-sm text-slate-200">
			Hard caps enforced by usage counters. Use 0 for disabled or unlimited where noted.
		</p>
	</header>
	<div class="px-5 py-5">
		<LimitsEditor bind:limits />
	</div>
</section>

<!-- SMS credit -->
<section
	class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
>
	<header class="border-b border-slate-800 px-5 py-4">
		<h2 class="text-base font-semibold text-white">SMS credit</h2>
		<p class="mt-1 text-sm text-slate-200">
			Prepaid dollar balance. Every outbound SMS deducts the per-SMS cost; sending is blocked at
			zero. Monthly allowance accumulates on top (rollover). Manual top-ups add to the balance.
		</p>
	</header>

	<div class="px-5 py-5 space-y-5">
		{#if creditLoading && !credit}
			<p class="text-sm text-slate-400">Loading SMS credit…</p>
		{:else if credit}
			<!-- Balance -->
			<div
				class="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4"
			>
				<div>
					<p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
						Current balance
					</p>
					<p
						class="mt-1 text-3xl font-bold tabular-nums {credit.balance <= 0
							? 'text-red-400'
							: 'text-white'}"
					>
						${credit.balance.toFixed(2)}
					</p>
				</div>
				<p class="text-[11px] text-slate-400">
					≈ {credit.per_sms_cost > 0 ? Math.floor(credit.balance / credit.per_sms_cost) : '∞'} messages
					left
					{#if credit.last_monthly_grant_at}
						<br />Last grant: {new Date(credit.last_monthly_grant_at).toLocaleDateString()}
					{/if}
				</p>
			</div>

			<!-- Config -->
			<div class="grid gap-4 sm:grid-cols-3">
				<div class="space-y-1.5">
					<label
						for="sms-cost"
						class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
					>
						Cost per SMS ($)
					</label>
					<input
						id="sms-cost"
						type="number"
						min="0"
						step="0.0001"
						bind:value={perSmsCost}
						class="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white tabular-nums outline-none transition-colors focus:border-indigo-500/60"
					/>
				</div>
				<div class="space-y-1.5">
					<label
						for="sms-monthly"
						class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
					>
						Monthly credit ($)
					</label>
					<input
						id="sms-monthly"
						type="number"
						min="0"
						step="0.01"
						bind:value={monthlyCredit}
						class="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white tabular-nums outline-none transition-colors focus:border-indigo-500/60"
					/>
				</div>
				<div class="space-y-1.5">
					<label
						for="sms-phone"
						class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
					>
						Twilio number
					</label>
					<input
						id="sms-phone"
						type="tel"
						placeholder="+15551234567"
						bind:value={phoneNumber}
						class="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white font-mono outline-none transition-colors focus:border-indigo-500/60"
					/>
				</div>
			</div>

			{#if creditError}
				<p class="text-sm text-red-400">{creditError}</p>
			{/if}
			{#if creditSaved}
				<p class="text-sm text-emerald-400">SMS credit settings saved.</p>
			{/if}

			<!-- Cost visibility toggle -->
			<label
				for="sms-show-cost"
				class="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3.5"
			>
				<div class="min-w-0">
					<p class="text-sm font-semibold text-white">Show per-SMS cost to contractor</p>
					<p class="mt-0.5 text-[11px] text-slate-400">
						When on, this org's Settings → SMS Credits page reveals the per-SMS price and an
						estimated messages-remaining count. Off by default — keep hidden unless the contractor
						needs it.
					</p>
				</div>
				<input
					id="sms-show-cost"
					type="checkbox"
					bind:checked={showCostToContractor}
					class="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-slate-600 bg-slate-900/50 text-indigo-500 accent-indigo-500 focus:ring-indigo-500/60"
				/>
			</label>

			<div class="flex justify-end">
				<button
					type="button"
					onclick={saveCreditConfig}
					disabled={creditSaving}
					class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
				>
					{creditSaving ? 'Saving…' : 'Save SMS settings'}
				</button>
			</div>

			<!-- Manual top-up -->
			<div class="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4 space-y-3">
				<p class="text-sm font-semibold text-white">Manual top-up</p>
				<p class="text-[11px] text-slate-400">
					Adds to the existing balance immediately. Use after a contractor requests more credit.
				</p>
				<div class="flex flex-col gap-3 sm:flex-row sm:items-end">
					<div class="space-y-1.5 sm:w-40">
						<label
							for="topup-amount"
							class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
						>
							Amount ($) <span class="text-red-400">*</span>
						</label>
						<input
							id="topup-amount"
							type="number"
							min="0"
							step="0.01"
							bind:value={topupAmount}
							placeholder="10.00"
							class="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white tabular-nums outline-none transition-colors focus:border-emerald-500/60"
						/>
					</div>
					<div class="space-y-1.5 flex-1">
						<label
							for="topup-note"
							class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
						>
							Note (optional)
						</label>
						<input
							id="topup-note"
							type="text"
							bind:value={topupNote}
							placeholder="e.g. WhatsApp request 5/29"
							class="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-emerald-500/60"
						/>
					</div>
					<button
						type="button"
						onclick={applyTopup}
						disabled={topupSaving || !topupAmount || topupAmount <= 0}
						class="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
					>
						{topupSaving ? 'Adding…' : 'Add credit'}
					</button>
				</div>
				{#if topupError}
					<p class="text-sm text-red-400">{topupError}</p>
				{/if}
			</div>

			<!-- Recent ledger -->
			{#if ledger.length > 0}
				<div class="space-y-2">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
						Recent activity
					</p>
					<ul class="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
						{#each ledger as row (row.id)}
							{@const amt = Number(row.amount)}
							<li class="flex items-center justify-between gap-3 bg-slate-950/40 px-4 py-2.5">
								<div class="min-w-0">
									<p class="text-sm font-medium text-slate-200">{ledgerLabels[row.entry_type]}</p>
									<p class="text-[11px] text-slate-400">
										{new Date(row.created_at).toLocaleString()}{row.note ? ` · ${row.note}` : ''}
									</p>
								</div>
								<div class="shrink-0 text-right">
									<p
										class="text-sm font-semibold tabular-nums {amt < 0
											? 'text-red-400'
											: 'text-emerald-400'}"
									>
										{amt < 0 ? '−' : '+'}${Math.abs(amt).toFixed(4)}
									</p>
									<p class="text-[11px] text-slate-400 tabular-nums">
										${Number(row.balance_after).toFixed(2)}
									</p>
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{:else if creditError}
			<p class="text-sm text-red-400">{creditError}</p>
		{/if}
	</div>
</section>

{#if org.feature_webchat}
	<section
		class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
	>
		<header class="border-b border-slate-800 px-5 py-4">
			<h2 class="text-base font-semibold text-white">Web Chat Widget</h2>
			<p class="mt-1 text-sm text-slate-200">
				Configure the embeddable chat widget for this org's website.
			</p>
		</header>

		<div class="px-5 py-5 space-y-5">
			{#if webchatLoading}
				<p class="text-sm text-slate-400">Loading widget configuration…</p>
			{:else if webchatWidget}
				<!-- Mode selector -->
				<div class="space-y-2">
					<label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
						Chat mode
					</label>
					<div class="flex gap-3">
						{#each [{ value: 'asynchronous', label: 'Asynchronous', hint: 'Visitors leave details, team replies later' }, { value: 'instant', label: 'Instant', hint: 'Implies team is ready to respond quickly' }] as mode (mode.value)}
							<button
								type="button"
								onclick={() => {
									if (webchatWidget)
										webchatWidget.webchat_mode = mode.value as 'instant' | 'asynchronous';
								}}
								class="flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer flex-1
									{webchatWidget.webchat_mode === mode.value
									? 'border-indigo-500/50 bg-indigo-500/10 text-white'
									: 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-600 hover:text-white'}"
							>
								<span class="text-sm font-semibold">{mode.label}</span>
								<span class="text-[11px] opacity-70">{mode.hint}</span>
							</button>
						{/each}
					</div>
				</div>

				<!-- Active toggle -->
				<div
					class="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3"
				>
					<div>
						<p class="text-sm font-semibold text-white">Widget active</p>
						<p class="text-[11px] text-slate-400">
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
						class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
							{webchatWidget.is_active ? 'bg-indigo-600' : 'bg-slate-800/60'}"
					>
						<span
							class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
								{webchatWidget.is_active ? 'translate-x-5' : 'translate-x-0'}"
						></span>
					</button>
				</div>

				<!-- Intro message -->
				<div class="space-y-1.5">
					<label
						for="wc-intro"
						class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
					>
						Intro message
					</label>
					<textarea
						id="wc-intro"
						rows={3}
						bind:value={webchatWidget.intro_message}
						class="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-indigo-500/60"
					></textarea>
					<p class="text-[11px] text-slate-400 italic">Preview: "{webchatWidget.intro_message}"</p>
				</div>

				<!-- Offline message -->
				<div class="space-y-1.5">
					<label
						for="wc-offline"
						class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
					>
						Offline message
					</label>
					<textarea
						id="wc-offline"
						rows={3}
						bind:value={webchatWidget.offline_message}
						class="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-indigo-500/60"
					></textarea>
					<p class="text-[11px] text-slate-400 italic">
						Preview: "{webchatWidget.offline_message}"
					</p>
				</div>

				<!-- Domain allowlist -->
				<div class="space-y-2">
					<label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
						Domain allowlist
					</label>
					<p class="text-[11px] text-slate-400">
						Leave empty to allow all origins. Add full origins like
						<code class="font-mono text-slate-400">https://example.com</code>.
					</p>
					<div class="flex gap-2">
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
							class="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-indigo-500/60"
						/>
						<button
							type="button"
							onclick={addDomain}
							class="shrink-0 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-sm font-semibold text-indigo-300 hover:bg-indigo-500/20 transition-colors cursor-pointer"
						>
							Add
						</button>
					</div>
					{#if webchatWidget.domain_allowlist.length > 0}
						<ul class="space-y-1.5">
							{#each webchatWidget.domain_allowlist as domain (domain)}
								<li
									class="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
								>
									<code class="font-mono text-xs text-slate-200">{domain}</code>
									<button
										type="button"
										onclick={() => removeDomain(domain)}
										class="text-[11px] font-semibold text-red-400 hover:text-red-300 transition-colors cursor-pointer"
									>
										Remove
									</button>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-[11px] text-slate-400">No domains added — all origins permitted.</p>
					{/if}
				</div>

				<!-- Widget token (immutable) -->
				<div class="space-y-1.5">
					<label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
						Widget token
					</label>
					<p class="text-[11px] text-slate-400">Generated once. Immutable. Never editable.</p>
					<div class="flex items-center gap-2">
						<code
							class="flex-1 truncate font-mono text-xs text-slate-200 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"
						>
							{webchatToken ?? '—'}
						</code>
						{#if webchatToken}
							<button
								type="button"
								onclick={() => copyLocal(webchatToken!, 'wc-token')}
								class="shrink-0 rounded-md border border-slate-800 bg-slate-800/60 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:border-slate-600 hover:text-white transition-colors cursor-pointer"
							>
								{copied === 'wc-token' ? 'Copied' : 'Copy'}
							</button>
						{/if}
					</div>
				</div>

				<!-- Embed snippet -->
				<div class="space-y-1.5">
					<label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
						Embed snippet
					</label>
					<p class="text-[11px] text-slate-400">
						Paste this into the <code class="font-mono text-slate-400">&lt;head&gt;</code> of the contractor's
						website.
					</p>
					<div class="relative">
						<pre
							class="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-emerald-300 leading-relaxed">{embedSnippet}</pre>
						<button
							type="button"
							onclick={() => copyLocal(embedSnippet, 'snippet')}
							class="absolute right-2 top-2 rounded-md border border-slate-800 bg-slate-800/60 px-2 py-1 text-[10px] font-semibold text-slate-400 hover:border-slate-600 hover:text-white transition-colors cursor-pointer"
						>
							{copied === 'snippet' ? 'Copied' : 'Copy'}
						</button>
					</div>
				</div>

				{#if webchatError}
					<p class="text-sm text-red-400">{webchatError}</p>
				{/if}
				{#if webchatSaved}
					<p class="text-sm text-emerald-400">Widget configuration saved.</p>
				{/if}

				<div class="flex justify-end">
					<button
						type="button"
						onclick={saveWebchatWidget}
						disabled={webchatSaving}
						class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
					>
						{webchatSaving ? 'Saving…' : 'Save widget config'}
					</button>
				</div>
			{/if}
		</div>
	</section>
{/if}
