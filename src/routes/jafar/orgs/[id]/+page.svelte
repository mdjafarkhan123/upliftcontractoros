<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import PlanTemplateSelector from '$lib/components/jafar/PlanTemplateSelector.svelte';
	import FeatureFlagsEditor from '$lib/components/jafar/FeatureFlagsEditor.svelte';
	import LimitsEditor from '$lib/components/jafar/LimitsEditor.svelte';
	import Toggle from '$lib/components/jafar/Toggle.svelte';
	import AdminSectionSkeleton from '$lib/components/jafar/skeletons/AdminSectionSkeleton.svelte';
	import AdminHeaderSkeleton from '$lib/components/jafar/skeletons/AdminHeaderSkeleton.svelte';
	import { FEATURE_FLAG_KEYS, LIMIT_KEYS } from '$lib/admin/featureGroups';
	import type { PlanName, PlanTemplate } from '$lib/admin/planTemplates';
	import type { FeatureFlags, OrgLimits } from '$lib/types';
	import { jafarOrgStore, type Org } from '$lib/stores/jafarOrg.svelte';
	import EmailDomainPanel from '$lib/components/jafar/EmailDomainPanel.svelte';

	// --- Temporary perf markers (remove once verified) ---
	const t0 = performance.now();
	function mark(label: string) {
		// eslint-disable-next-line no-console
		console.log(`[orgPage] ${label} +${(performance.now() - t0).toFixed(1)}ms`);
	}
	mark('script-eval');
	onMount(() => {
		mark('mount');
		requestAnimationFrame(() => mark('first-paint'));
	});

	const orgId = $derived(page.params.id as string);
	const org = $derived(jafarOrgStore.currentId === orgId ? jafarOrgStore.org : null);
	const status = $derived(jafarOrgStore.currentId === orgId ? jafarOrgStore.status : 'loading');
	const fetchError = $derived(jafarOrgStore.currentId === orgId ? jafarOrgStore.error : null);

	$effect(() => {
		const id = orgId;
		if (!id) return;
		mark('fetch-start');
		jafarOrgStore.load(id).then(() => mark('fetch-complete'));
	});

	const showSkeleton = $derived(!org && status !== 'error');
	const showError = $derived(status === 'error' && !org);

	// Module-scope key arrays — no per-render allocation.
	const flagKeys = FEATURE_FLAG_KEYS;
	const limitKeys = LIMIT_KEYS;

	function pickFlags(o: Org): FeatureFlags {
		const out = {} as FeatureFlags;
		for (const k of flagKeys) (out as Record<string, unknown>)[k] = o[k];
		return out;
	}

	function pickLimits(o: Org): OrgLimits {
		const out = {} as OrgLimits;
		for (const k of limitKeys) (out as Record<string, unknown>)[k] = o[k];
		return out;
	}

	let plan = $state<PlanName>('starter');
	let flags = $state<FeatureFlags>({} as FeatureFlags);
	let limits = $state<OrgLimits>({} as OrgLimits);
	let smsEnabled = $state(true);
	let seeded = $state(false);
	let seededOrgId = $state<string | null>(null);

	// Frozen snapshot of last seeded values — drives dirty without serialization.
	type Baseline = {
		plan: PlanName;
		flags: FeatureFlags;
		limits: OrgLimits;
		smsEnabled: boolean;
	};
	let baseline = $state<Baseline | null>(null);

	$effect(() => {
		if (orgId !== seededOrgId) {
			seeded = false;
			seededOrgId = orgId;
		}
		if (!seeded && org && status === 'ready') {
			const seedPlan = org.plan ?? 'starter';
			const seedFlags = pickFlags(org);
			const seedLimits = pickLimits(org);
			const seedSms = org.sms_enabled;
			plan = seedPlan;
			flags = { ...seedFlags };
			limits = { ...seedLimits };
			smsEnabled = seedSms;
			baseline = {
				plan: seedPlan,
				flags: seedFlags,
				limits: seedLimits,
				smsEnabled: seedSms
			};
			seeded = true;
			mark('seed-complete');
		}
	});

	const dirty = $derived.by(() => {
		if (!seeded || !baseline) return false;
		if (plan !== baseline.plan) return true;
		if (smsEnabled !== baseline.smsEnabled) return true;
		for (let i = 0; i < flagKeys.length; i++) {
			const k = flagKeys[i];
			if (flags[k] !== baseline.flags[k]) return true;
		}
		for (let i = 0; i < limitKeys.length; i++) {
			const k = limitKeys[i];
			if (limits[k] !== baseline.limits[k]) return true;
		}
		return false;
	});

	let updating = $state(false);
	let savingEntitlements = $state(false);
	let actionError = $state('');
	let saved = $state(false);
	let copied = $state<string | null>(null);

	// ── Webchat widget config ────────────────────────────────────────────────
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

	// Load webchat config when org is ready and webchat feature is enabled
	$effect(() => {
		if (org && org.feature_webchat && orgId) {
			void loadWebchatWidget(orgId);
		}
	});

	const statusStyles: Record<Org['status'], string> = {
		active: 'jafar-badge jafar-badge--active',
		suspended: 'jafar-badge jafar-badge--suspended',
		pending_setup: 'jafar-badge jafar-badge--pending_setup',
		pending_deletion: 'jafar-badge jafar-badge--pending_deletion',
		deleted: 'jafar-badge jafar-badge--deleted'
	};

	const statusLabels: Record<Org['status'], string> = {
		active: 'Active',
		suspended: 'Suspended',
		pending_setup: 'Pending setup',
		pending_deletion: 'Pending deletion',
		deleted: 'Deleted'
	};

	function applyTemplate(t: PlanTemplate) {
		plan = t.plan;
		flags = { ...t.flags };
		limits = { ...t.limits };
		saved = false;
	}

	async function reseedFromServer() {
		// Explicit mutations require a fresh read and a re-seed of the form.
		seeded = false;
		await jafarOrgStore.refresh(orgId);
	}

	async function updateStatus(next: 'active' | 'suspended') {
		if (updating) return;
		updating = true;
		actionError = '';
		try {
			const res = await fetch(`/api/admin/orgs/${orgId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: next })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? body.message ?? 'Status update failed');
			}
			await reseedFromServer();
		} catch (e) {
			actionError = e instanceof Error ? e.message : 'Status update failed';
		} finally {
			updating = false;
		}
	}

	async function completeSetup() {
		if (updating) return;
		updating = true;
		actionError = '';
		try {
			const res = await fetch(`/api/admin/orgs/${orgId}/complete-setup`, { method: 'POST' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? body.message ?? 'Setup completion failed');
			}
			await reseedFromServer();
		} catch (e) {
			actionError = e instanceof Error ? e.message : 'Setup completion failed';
		} finally {
			updating = false;
		}
	}

	async function saveEntitlements() {
		if (savingEntitlements || !dirty) return;
		savingEntitlements = true;
		actionError = '';
		saved = false;
		try {
			const res = await fetch(`/api/admin/orgs/${orgId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					plan,
					featureFlags: flags,
					limits,
					sms_enabled: smsEnabled
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? body.message ?? 'Save failed');
			}
			saved = true;
			await reseedFromServer();
		} catch (e) {
			actionError = e instanceof Error ? e.message : 'Save failed';
		} finally {
			savingEntitlements = false;
		}
	}

	function discardChanges() {
		if (!org) return;
		plan = org.plan ?? 'starter';
		flags = pickFlags(org);
		limits = pickLimits(org);
		smsEnabled = org.sms_enabled;
		saved = false;
	}

	async function copyValue(value: string, key: string) {
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

	// Real connection status, derived from the dedicated org columns that the
	// contractor's settings actually write to (Stripe → /api/settings/stripe,
	// Twilio number → provisioning). The old integration_status JSON was never
	// populated for these, so the panel always showed empty.
	type Connection = {
		key: string;
		label: string;
		sublabel: string;
		connected: boolean;
		detail: string | null;
		mode: 'live' | 'test' | null;
	};
	const connections = $derived.by<Connection[]>(() => {
		if (!org) return [];
		return [
			{
				// Connected = a credential set was saved (DELETE nulls stripe_connected_at).
				// stripe_account_id stays null when the restricted key lacks Account:read
				// scope, so it is NOT a reliable connection signal — connected_at is.
				key: 'stripe',
				label: 'Stripe',
				sublabel: 'Card payments',
				connected: Boolean(org.stripe_connected_at),
				detail: org.stripe_connected_at
					? (org.stripe_account_name ?? org.stripe_account_email)
					: null,
				mode: org.stripe_connected_at
					? org.stripe_livemode == null
						? null
						: org.stripe_livemode
							? 'live'
							: 'test'
					: null
			},
			{
				key: 'twilio',
				label: 'Twilio',
				sublabel: 'SMS & calls',
				connected: Boolean(org.twilio_phone_number),
				detail: org.twilio_phone_number,
				mode: null
			}
		];
	});

	// Up-to-two-letter monogram for the org avatar tile in the hero.
	const orgInitials = $derived(
		(org?.name ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('') || '—'
	);

	type Category = 'general' | 'entitlements' | 'integrations' | 'details';
	// Deep-link: /jafar/orgs/[id]?tab=details opens the Details tab directly.
	let activeCategory = $state<Category>(
		page.url.searchParams.get('tab') === 'details' ? 'details' : 'general'
	);

	const categoryItems = [
		{
			id: 'general' as Category,
			label: 'General',
			desc: 'Identity, status & actions',
			icon: 'ri-building-line'
		},
		{
			id: 'details' as Category,
			label: 'Details',
			desc: 'Onboarding & carrier data',
			icon: 'ri-file-list-3-line'
		},
		{
			id: 'entitlements' as Category,
			label: 'Entitlements',
			desc: 'Plan, flags & limits',
			icon: 'ri-flag-line'
		},
		{
			id: 'integrations' as Category,
			label: 'Integrations',
			desc: 'Chat, email & connections',
			icon: 'ri-links-line'
		}
	] as const;

	// ── Details tab: carrier registration is only relevant for US/CA orgs ────────
	const carrierRequired = $derived(org?.country === 'US' || org?.country === 'CA');

	function fieldOrDash(v: string | null | undefined): string {
		return v && v.trim() ? v : '';
	}

	// "Copy All" assembles a labeled, paste-ready block for manual Twilio submission.
	const carrierCopyAll = $derived.by(() => {
		if (!org) return '';
		const addr = [org.address, org.city, org.state, org.zip].filter(Boolean).join(', ');
		const lines: string[] = [];
		lines.push(`Organization: ${org.name}`);
		lines.push(`Country: ${org.country ?? '—'}`);
		if (org.country === 'CA') {
			lines.push(`Business name: ${fieldOrDash(org.legal_business_name) || '—'}`);
			lines.push(`Business Number: ${fieldOrDash(org.business_number) || '—'}`);
		} else {
			lines.push(`Legal business name: ${fieldOrDash(org.legal_business_name) || '—'}`);
			lines.push(`EIN: ${fieldOrDash(org.ein) || '—'}`);
			lines.push(`Website: ${fieldOrDash(org.website) || '—'}`);
		}
		lines.push(`Address: ${addr || '—'}`);
		lines.push(`Messaging use case: ${fieldOrDash(org.messaging_use_case) || '—'}`);
		lines.push(`Phone number: ${org.twilio_phone_number ?? '—'}`);
		return lines.join('\n');
	});

	// SMS credit balance (read-only, fetched lazily when the Details tab is viewed).
	let creditBalance = $state<number | null>(null);
	let creditLoading = $state(false);
	let creditLoadedOrgId = $state<string | null>(null);

	async function loadCredit(id: string) {
		creditLoading = true;
		try {
			const res = await fetch(`/api/admin/orgs/${id}/sms-credit`);
			if (res.ok) {
				const body = (await res.json()) as { data: { credit: { balance: number } } };
				creditBalance = body.data.credit.balance;
			} else {
				creditBalance = null;
			}
		} catch {
			creditBalance = null;
		} finally {
			creditLoading = false;
			creditLoadedOrgId = id;
		}
	}

	$effect(() => {
		if (activeCategory === 'details' && org && orgId && creditLoadedOrgId !== orgId) {
			void loadCredit(orgId);
		}
	});

	// ── Approval lifecycle actions (single home — immediate PATCH + reseed) ──────
	let approving = $state(false);
	let showRejectForm = $state(false);
	let rejectReason = $state('');

	async function patchApproval(body: Record<string, unknown>) {
		if (approving) return;
		approving = true;
		actionError = '';
		try {
			const res = await fetch(`/api/admin/orgs/${orgId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const b = await res.json().catch(() => ({}));
				throw new Error(b.error ?? 'Update failed');
			}
			showRejectForm = false;
			rejectReason = '';
			await reseedFromServer();
		} catch (e) {
			actionError = e instanceof Error ? e.message : 'Update failed';
		} finally {
			approving = false;
		}
	}

	function markApproved() {
		void patchApproval({ sms_approval_status: 'approved', sms_approval_reason: null });
	}

	function requestResubmission() {
		if (!rejectReason.trim()) return;
		void patchApproval({
			sms_approval_status: 'rejected',
			sms_approval_reason: rejectReason.trim()
		});
	}

	const approvalBadge: Record<Org['sms_approval_status'], string> = {
		not_required: 'jafar-badge jafar-badge--muted',
		pending: 'jafar-badge jafar-badge--pending',
		approved: 'jafar-badge jafar-badge--active',
		rejected: 'jafar-badge jafar-badge--red'
	};
	const approvalLabel: Record<Org['sms_approval_status'], string> = {
		not_required: 'Not required',
		pending: 'Pending',
		approved: 'Approved',
		rejected: 'Rejected'
	};
</script>

<svelte:head>
	<title>{org ? `${org.name} · Jafar` : 'Organization · Jafar'}</title>
</svelte:head>

<div class="jafar-orgdetail">
	<!-- Back (always instant) -->
	<a href="/jafar/dashboard" class="jafar-back">
		<i class="ri-arrow-left-s-line" aria-hidden="true"></i>
		Back to dashboard
	</a>

	{#if showSkeleton}
		<AdminHeaderSkeleton />
		<AdminSectionSkeleton titleWidth="w-24" bodyRows={4} grid />
		<AdminSectionSkeleton titleWidth="w-32" bodyRows={3} />
		<AdminSectionSkeleton titleWidth="w-32" bodyRows={6} grid />
		<AdminSectionSkeleton titleWidth="w-28" bodyRows={3} grid />
	{:else if showError}
		<div role="alert" class="jafar-alert jafar-alert--error jafar-alert--center">
			<p class="jafar-alert__title">Failed to load organization</p>
			<p class="jafar-alert__text">{fetchError ?? 'Unknown error.'}</p>
			<button
				type="button"
				class="jafar-btn jafar-btn--danger"
				onclick={() => jafarOrgStore.refresh(orgId)}
			>
				Retry
			</button>
		</div>
	{:else if org}
		<!-- Header -->
		<div class="jafar-org-hd">
			<div class="jafar-org-hd__inner">
				<span class="jafar-org-hd__initials" aria-hidden="true">{orgInitials}</span>
				<div class="jafar-org-hd__meta">
					<div class="jafar-org-hd__pills">
						<h1>{org.name}</h1>
						<span class={statusStyles[org.status]}>
							<span class="jafar-badge__dot"></span>
							{statusLabels[org.status]}
						</span>
						{#if org.is_setup_complete}
							<span class="jafar-badge jafar-badge--sky">Setup complete</span>
						{:else}
							<span class="jafar-badge jafar-badge--muted">Setup pending</span>
						{/if}
						{#if status === 'revalidating'}
							<span class="jafar-org-hd__revalidating">
								<i class="ri-loader-4-line" aria-hidden="true"></i>
								Refreshing
							</span>
						{/if}
					</div>
					<p class="jafar-org-hd__sub">
						<span class="jafar-org-hd__slug">/{org.slug}</span>
						<span class="jafar-org-hd__dot">·</span>
						{org.trade_type}
					</p>
				</div>
			</div>
		</div>

		{#if actionError}
			<div role="alert" class="jafar-alert jafar-alert--error">
				<span class="jafar-alert__icon">
					<i class="ri-error-warning-line" aria-hidden="true"></i>
				</span>
				<div>
					<p class="jafar-alert__title">Action failed</p>
					<p class="jafar-alert__text">{actionError}</p>
				</div>
			</div>
		{/if}

		{#if saved && !dirty}
			<div role="status" class="jafar-alert jafar-alert--emerald">
				<span class="jafar-alert__icon">
					<i class="ri-check-line" aria-hidden="true"></i>
				</span>
				Entitlements saved.
			</div>
		{/if}

		<!-- Settings: sidebar + content panel -->
		<div class="jafar-orgdetail__body">
			<!-- Sidebar nav -->
			<aside class="jafar-cat">
				<nav class="jafar-cat__nav">
					<p class="jafar-cat__label">Settings</p>
					<div class="jafar-cat__list">
						{#each categoryItems as cat (cat.id)}
							<button
								type="button"
								onclick={() => (activeCategory = cat.id)}
								class="jafar-cat__item"
								class:jafar-cat__item--active={activeCategory === cat.id}
							>
								<span class="jafar-cat__icon" aria-hidden="true">
									<i class={cat.icon}></i>
								</span>
								<div>
									<p class="jafar-cat__item-label">{cat.label}</p>
									<p class="jafar-cat__item-desc">{cat.desc}</p>
								</div>
							</button>
						{/each}
					</div>
				</nav>
			</aside>

			<!-- Content panel -->
			<div class="jafar-orgdetail__content">
				{#if activeCategory === 'general'}
					<!-- Overview -->
					<section class="jafar-panel">
						<header class="jafar-panel__head">
							<span class="jafar-panel__icon jafar-panel__icon--sky" aria-hidden="true">
								<i class="ri-building-line"></i>
							</span>
							<div>
								<h2 class="jafar-panel__title">Overview</h2>
								<p class="jafar-panel__sub">Tenant identity and operating region.</p>
							</div>
						</header>

						<dl class="jafar-dl">
							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Organization ID</dt>
								<dd class="jafar-dl__val">
									<code class="jafar-dl__code">{org.id}</code>
									<button
										type="button"
										class="jafar-dl__copy"
										onclick={() => copyValue(org!.id, 'id')}
									>
										{copied === 'id' ? 'Copied' : 'Copy'}
									</button>
								</dd>
							</div>

							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Slug</dt>
								<dd class="jafar-dl__val"><span class="jafar-dl__code">{org.slug}</span></dd>
							</div>

							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Trade type</dt>
								<dd class="jafar-dl__val"><span class="jafar-dl__text">{org.trade_type}</span></dd>
							</div>

							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Location</dt>
								<dd class="jafar-dl__val">
									{#if org.city || org.state}
										<span class="jafar-dl__text">
											{[org.city, org.state].filter(Boolean).join(', ')}
										</span>
									{:else}
										<span class="jafar-dl__muted">—</span>
									{/if}
								</dd>
							</div>

							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Timezone</dt>
								<dd class="jafar-dl__val"><span class="jafar-dl__code">{org.timezone}</span></dd>
							</div>

							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Twilio phone</dt>
								<dd class="jafar-dl__val">
									{#if org.twilio_phone_number}
										<span class="jafar-dl__code">{org.twilio_phone_number}</span>
										<button
											type="button"
											class="jafar-dl__copy"
											onclick={() => copyValue(org!.twilio_phone_number!, 'phone')}
										>
											{copied === 'phone' ? 'Copied' : 'Copy'}
										</button>
									{:else}
										<span class="jafar-dl__na">Not set</span>
									{/if}
								</dd>
							</div>

							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Created</dt>
								<dd class="jafar-dl__val">
									<span class="jafar-dl__text">{new Date(org.created_at).toLocaleString()}</span>
								</dd>
							</div>

							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Entitlements updated</dt>
								<dd class="jafar-dl__val">
									{#if org.feature_overrides_updated_at}
										<span class="jafar-dl__text">
											{new Date(org.feature_overrides_updated_at).toLocaleString()}
										</span>
									{:else}
										<span class="jafar-dl__muted">Never</span>
									{/if}
								</dd>
							</div>
						</dl>
					</section>

					<!-- Lifecycle actions -->
					<section class="jafar-panel">
						<header class="jafar-panel__head">
							<span class="jafar-panel__icon jafar-panel__icon--rose" aria-hidden="true">
								<i class="ri-shut-down-line"></i>
							</span>
							<div>
								<h2 class="jafar-panel__title">Lifecycle actions</h2>
								<p class="jafar-panel__sub">
									Change tenant status or finalize provisioning. Actions take effect immediately.
								</p>
							</div>
						</header>

						<div class="jafar-life__grid">
							<button
								type="button"
								disabled={updating || org.status === 'active'}
								onclick={() => updateStatus('active')}
								class="jafar-life__card jafar-life__card--emerald"
							>
								<span class="jafar-life__icon jafar-life__icon--emerald" aria-hidden="true">
									<i class="ri-check-line"></i>
								</span>
								<span class="jafar-life__title">Set active</span>
								<span class="jafar-life__hint">Tenant can log in and operate.</span>
							</button>

							<button
								type="button"
								disabled={updating || org.status === 'suspended'}
								onclick={() => updateStatus('suspended')}
								class="jafar-life__card jafar-life__card--amber"
							>
								<span class="jafar-life__icon jafar-life__icon--amber" aria-hidden="true">
									<i class="ri-pause-line"></i>
								</span>
								<span class="jafar-life__title">Suspend</span>
								<span class="jafar-life__hint">Block access without deleting data.</span>
							</button>

							<button
								type="button"
								disabled={updating || org.is_setup_complete}
								onclick={completeSetup}
								class="jafar-life__card jafar-life__card--sky"
							>
								<span class="jafar-life__icon jafar-life__icon--sky" aria-hidden="true">
									<i class="ri-checkbox-circle-line"></i>
								</span>
								<span class="jafar-life__title">Complete setup</span>
								<span class="jafar-life__hint">Mark provisioning as finalized.</span>
							</button>
						</div>

						{#if updating}
							<div class="jafar-life__applying">
								<i class="ri-loader-4-line" aria-hidden="true"></i>
								Applying change…
							</div>
						{/if}
					</section>
				{:else if activeCategory === 'details'}
					<!-- Business Profile -->
					<section class="jafar-panel">
						<header class="jafar-panel__head">
							<span class="jafar-panel__icon jafar-panel__icon--sky" aria-hidden="true">
								<i class="ri-building-line"></i>
							</span>
							<div>
								<h2 class="jafar-panel__title">Business profile</h2>
								<p class="jafar-panel__sub">Onboarding Step 2 — collected from the contractor.</p>
							</div>
						</header>
						<dl class="jafar-dl">
							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Company name</dt>
								<dd class="jafar-dl__val"><span class="jafar-dl__text">{org.name}</span></dd>
							</div>
							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Trade type</dt>
								<dd class="jafar-dl__val"><span class="jafar-dl__text">{org.trade_type}</span></dd>
							</div>
							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Country</dt>
								<dd class="jafar-dl__val">
									<span class="jafar-dl__text">{org.country ?? '—'}</span>
								</dd>
							</div>
							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Timezone</dt>
								<dd class="jafar-dl__val"><span class="jafar-dl__code">{org.timezone}</span></dd>
							</div>
							<div class="jafar-dl__cell jafar-dl__cell--full">
								<dt class="jafar-dl__term">Address</dt>
								<dd class="jafar-dl__val">
									{#if org.address || org.city || org.state || org.zip}
										<span class="jafar-dl__text">
											{[org.address, org.city, org.state, org.zip].filter(Boolean).join(', ')}
										</span>
									{:else}
										<span class="jafar-dl__muted">—</span>
									{/if}
								</dd>
							</div>
						</dl>
					</section>

					<!-- Phone & SMS -->
					<section class="jafar-panel">
						<header class="jafar-panel__head">
							<span class="jafar-panel__icon jafar-panel__icon--emerald" aria-hidden="true">
								<i class="ri-phone-line"></i>
							</span>
							<div>
								<h2 class="jafar-panel__title">Phone &amp; SMS</h2>
								<p class="jafar-panel__sub">Number, subaccount, and sending state.</p>
							</div>
						</header>
						<dl class="jafar-dl">
							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Twilio phone</dt>
								<dd class="jafar-dl__val">
									{#if org.twilio_phone_number}
										<span class="jafar-dl__code">{org.twilio_phone_number}</span>
										<button
											type="button"
											class="jafar-dl__copy"
											onclick={() => copyValue(org!.twilio_phone_number!, 'd-phone')}
										>
											{copied === 'd-phone' ? 'Copied' : 'Copy'}
										</button>
									{:else}
										<span class="jafar-dl__na">Not set</span>
									{/if}
								</dd>
							</div>
							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Subaccount SID</dt>
								<dd class="jafar-dl__val">
									{#if org.twilio_subaccount_sid}
										<code class="jafar-dl__code">{org.twilio_subaccount_sid}</code>
										<button
											type="button"
											class="jafar-dl__copy"
											onclick={() => copyValue(org!.twilio_subaccount_sid!, 'd-sid')}
										>
											{copied === 'd-sid' ? 'Copied' : 'Copy'}
										</button>
									{:else}
										<span class="jafar-dl__na">None</span>
									{/if}
								</dd>
							</div>
							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">SMS enabled</dt>
								<dd class="jafar-dl__val">
									{#if org.sms_enabled}
										<span class="jafar-badge jafar-badge--active">On</span>
									{:else}
										<span class="jafar-badge jafar-badge--muted">Off</span>
									{/if}
								</dd>
							</div>
							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Approval status</dt>
								<dd class="jafar-dl__val">
									<span class={approvalBadge[org.sms_approval_status]}>
										{approvalLabel[org.sms_approval_status]}
									</span>
								</dd>
							</div>
						</dl>
					</section>

					<!-- Carrier Registration -->
					<section class="jafar-panel">
						<header class="jafar-panel__head jafar-panel__head--between">
							<div class="jafar-org-hd__inner">
								<span class="jafar-panel__icon jafar-panel__icon--violet" aria-hidden="true">
									<i class="ri-file-list-3-line"></i>
								</span>
								<div>
									<h2 class="jafar-panel__title">Carrier registration</h2>
									<p class="jafar-panel__sub">
										Onboarding Step 4 — for manual Twilio {org.country === 'CA' ? 'CWTA' : '10DLC'} submission.
									</p>
								</div>
							</div>
							{#if carrierRequired}
								<button
									type="button"
									class="jafar-btn jafar-btn--sm"
									onclick={() => copyValue(carrierCopyAll, 'd-carrier-all')}
								>
									{copied === 'd-carrier-all' ? 'Copied all' : 'Copy all'}
								</button>
							{/if}
						</header>

						{#if !carrierRequired}
							<div class="jafar-panel__body">
								<p class="jafar-fmsg jafar-fmsg--muted">
									Not required — carrier registration applies to US (10DLC) and Canada (CWTA) only.
								</p>
							</div>
						{:else}
							<dl class="jafar-dl">
								<div class="jafar-dl__cell">
									<dt class="jafar-dl__term">
										{org.country === 'CA' ? 'Business name' : 'Legal business name'}
									</dt>
									<dd class="jafar-dl__val">
										{#if org.legal_business_name}
											<span class="jafar-dl__text">{org.legal_business_name}</span>
											<button
												type="button"
												class="jafar-dl__copy"
												onclick={() => copyValue(org!.legal_business_name!, 'd-legal')}
											>
												{copied === 'd-legal' ? 'Copied' : 'Copy'}
											</button>
										{:else}
											<span class="jafar-dl__na">Not provided</span>
										{/if}
									</dd>
								</div>

								{#if org.country === 'CA'}
									<div class="jafar-dl__cell">
										<dt class="jafar-dl__term">Business Number</dt>
										<dd class="jafar-dl__val">
											{#if org.business_number}
												<span class="jafar-dl__code">{org.business_number}</span>
												<button
													type="button"
													class="jafar-dl__copy"
													onclick={() => copyValue(org!.business_number!, 'd-bn')}
												>
													{copied === 'd-bn' ? 'Copied' : 'Copy'}
												</button>
											{:else}
												<span class="jafar-dl__na">Not provided</span>
											{/if}
										</dd>
									</div>
								{:else}
									<div class="jafar-dl__cell">
										<dt class="jafar-dl__term">EIN</dt>
										<dd class="jafar-dl__val">
											{#if org.ein}
												<span class="jafar-dl__code">{org.ein}</span>
												<button
													type="button"
													class="jafar-dl__copy"
													onclick={() => copyValue(org!.ein!, 'd-ein')}
												>
													{copied === 'd-ein' ? 'Copied' : 'Copy'}
												</button>
											{:else}
												<span class="jafar-dl__na">Not provided</span>
											{/if}
										</dd>
									</div>
									<div class="jafar-dl__cell">
										<dt class="jafar-dl__term">Website</dt>
										<dd class="jafar-dl__val">
											{#if org.website}
												<span class="jafar-dl__text">{org.website}</span>
												<button
													type="button"
													class="jafar-dl__copy"
													onclick={() => copyValue(org!.website!, 'd-web')}
												>
													{copied === 'd-web' ? 'Copied' : 'Copy'}
												</button>
											{:else}
												<span class="jafar-dl__na">Not provided</span>
											{/if}
										</dd>
									</div>
								{/if}

								<div class="jafar-dl__cell jafar-dl__cell--full">
									<dt class="jafar-dl__term">Messaging use case</dt>
									<dd class="jafar-dl__val jafar-dl__val--start">
										{#if org.messaging_use_case}
											<p class="jafar-dl__pre">{org.messaging_use_case}</p>
											<button
												type="button"
												class="jafar-dl__copy"
												onclick={() => copyValue(org!.messaging_use_case!, 'd-usecase')}
											>
												{copied === 'd-usecase' ? 'Copied' : 'Copy'}
											</button>
										{:else}
											<span class="jafar-dl__na">Not provided</span>
										{/if}
									</dd>
								</div>
							</dl>
						{/if}
					</section>

					<!-- Branding -->
					<section class="jafar-panel">
						<header class="jafar-panel__head">
							<span class="jafar-panel__icon jafar-panel__icon--rose" aria-hidden="true">
								<i class="ri-palette-line"></i>
							</span>
							<div>
								<h2 class="jafar-panel__title">Branding</h2>
								<p class="jafar-panel__sub">Onboarding Step 5 — logo, colors, hours.</p>
							</div>
						</header>
						<dl class="jafar-dl">
							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Logo</dt>
								<dd class="jafar-dl__val">
									{#if org.logo_url}
										<img src={org.logo_url} alt="{org.name} logo" class="jafar-dl__logo" />
									{:else}
										<span class="jafar-dl__na">No logo</span>
									{/if}
								</dd>
							</div>
							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Primary color</dt>
								<dd class="jafar-dl__val">
									{#if org.primary_color}
										<span class="jafar-dl__swatch" style="background-color: {org.primary_color}"
										></span>
										<span class="jafar-dl__code">{org.primary_color}</span>
									{:else}
										<span class="jafar-dl__na">Default</span>
									{/if}
								</dd>
							</div>
							<div class="jafar-dl__cell jafar-dl__cell--full">
								<dt class="jafar-dl__term">Business hours</dt>
								<dd class="jafar-dl__val">
									<span class="jafar-dl__code">
										{org.calendar_day_start_hour}:00 – {org.calendar_day_end_hour}:00
									</span>
								</dd>
							</div>
						</dl>
					</section>

					<!-- Account status & approval lifecycle -->
					<section class="jafar-panel">
						<header class="jafar-panel__head">
							<span class="jafar-panel__icon jafar-panel__icon--amber" aria-hidden="true">
								<i class="ri-shield-check-line"></i>
							</span>
							<div>
								<h2 class="jafar-panel__title">Account status</h2>
								<p class="jafar-panel__sub">Carrier approval lifecycle and SMS credit balance.</p>
							</div>
						</header>

						<dl class="jafar-dl">
							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Tenant status</dt>
								<dd class="jafar-dl__val">
									<span class={statusStyles[org.status]}>{statusLabels[org.status]}</span>
								</dd>
							</div>
							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Setup</dt>
								<dd class="jafar-dl__val">
									<span class="jafar-dl__text"
										>{org.is_setup_complete ? 'Complete' : 'Pending'}</span
									>
								</dd>
							</div>
							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">Approval submitted</dt>
								<dd class="jafar-dl__val">
									{#if org.sms_approval_submitted_at}
										<span class="jafar-dl__text">
											{new Date(org.sms_approval_submitted_at).toLocaleString()}
										</span>
									{:else}
										<span class="jafar-dl__muted">Never</span>
									{/if}
								</dd>
							</div>
							<div class="jafar-dl__cell">
								<dt class="jafar-dl__term">SMS credit balance</dt>
								<dd class="jafar-dl__val">
									{#if creditLoading && creditBalance === null}
										<span class="jafar-dl__muted">Loading…</span>
									{:else if creditBalance !== null}
										<span class="jafar-dl__text">${creditBalance.toFixed(2)}</span>
									{:else}
										<span class="jafar-dl__muted">No credit account</span>
									{/if}
								</dd>
							</div>
						</dl>

						<!-- Approval actions -->
						<div class="jafar-approval">
							<div class="jafar-approval__status">
								<span class="jafar-approval__status-label">Carrier approval:</span>
								<span class={approvalBadge[org.sms_approval_status]}>
									{approvalLabel[org.sms_approval_status]}
								</span>
							</div>

							{#if carrierRequired}
								{#if org.sms_approval_status === 'rejected' && org.sms_approval_reason}
									<div class="jafar-approval__reason">
										<p class="jafar-approval__reason-term">Resubmission reason</p>
										<p class="jafar-approval__reason-text">{org.sms_approval_reason}</p>
									</div>
								{/if}

								<div class="jafar-approval__actions">
									<button
										type="button"
										disabled={approving || org.sms_approval_status === 'approved'}
										onclick={markApproved}
										class="jafar-btn jafar-btn--emerald"
									>
										<i class="ri-check-line" aria-hidden="true"></i>
										Mark approved
									</button>
									<button
										type="button"
										disabled={approving}
										onclick={() => (showRejectForm = !showRejectForm)}
										class="jafar-btn"
									>
										Request resubmission
									</button>
								</div>

								{#if showRejectForm}
									<div class="jafar-approval__form">
										<label for="reject-reason" class="jafar-flabel">
											Resubmission reason <span class="jafar-flabel__req">*</span>
										</label>
										<textarea
											id="reject-reason"
											rows={3}
											bind:value={rejectReason}
											placeholder="What needs to be corrected before resubmitting to the carrier?"
											class="jafar-textarea"
										></textarea>
										<div class="jafar-approval__form-actions">
											<button
												type="button"
												disabled={approving || !rejectReason.trim()}
												onclick={requestResubmission}
												class="jafar-btn jafar-btn--red"
											>
												{approving ? 'Saving…' : 'Mark rejected'}
											</button>
										</div>
									</div>
								{/if}
							{:else}
								<p class="jafar-approval__note">
									Approval isn't required for this org — carrier registration (US 10DLC / Canada
									CWTA) applies to US and Canada only, so outbound SMS is permitted without it.
								</p>
							{/if}
						</div>
					</section>
				{:else if activeCategory === 'entitlements'}
					{#if seeded}
						<!-- SMS activation (master switch) -->
						<section class="jafar-panel">
							<header class="jafar-panel__head">
								<span class="jafar-panel__icon jafar-panel__icon--emerald" aria-hidden="true">
									<i class="ri-chat-3-line"></i>
								</span>
								<div>
									<h2 class="jafar-panel__title">SMS activation</h2>
									<p class="jafar-panel__sub">
										Master switch for this tenant's SMS. When off, all outbound SMS is blocked and
										the SMS feature flags below are locked — their stored values are preserved.
									</p>
								</div>
							</header>
							<div class="jafar-switchrow">
								<div class="jafar-switchrow__info">
									<p class="jafar-switchrow__title">SMS enabled</p>
									<p class="jafar-switchrow__desc">
										{smsEnabled
											? 'Outbound SMS is permitted (subject to number, approval, and credit).'
											: 'Outbound SMS is blocked org-wide. Inbound is still received and stored.'}
									</p>
								</div>
								<Toggle bind:checked={smsEnabled} ariaLabel="Toggle SMS enabled" />
							</div>
							<div class="jafar-panel__note">
								Carrier approval (US 10DLC / Canada CWTA) is managed in the
								<button type="button" onclick={() => (activeCategory = 'details')}>Details</button>
								tab.
							</div>
						</section>

						<!-- Plan template -->
						<section class="jafar-panel">
							<header class="jafar-panel__head">
								<span class="jafar-panel__icon jafar-panel__icon--violet" aria-hidden="true">
									<i class="ri-medal-line"></i>
								</span>
								<div>
									<h2 class="jafar-panel__title">Plan template</h2>
									<p class="jafar-panel__sub">
										Plan is display metadata. Feature flags below are the real entitlement system.
									</p>
								</div>
							</header>
							<div class="jafar-panel__body">
								<PlanTemplateSelector bind:value={plan} onApply={applyTemplate} />
							</div>
						</section>

						<!-- Feature flags -->
						<section class="jafar-panel">
							<header class="jafar-panel__head">
								<span class="jafar-panel__icon jafar-panel__icon--indigo" aria-hidden="true">
									<i class="ri-flag-line"></i>
								</span>
								<div>
									<h2 class="jafar-panel__title">Feature flags</h2>
									<p class="jafar-panel__sub">
										The authoritative entitlement layer. Disable a flag and the tenant loses the
										feature — no role bypass.
									</p>
								</div>
							</header>
							<div class="jafar-panel__body">
								<FeatureFlagsEditor
									bind:flags
									integrationStatus={org.integration_status ?? {}}
									{smsEnabled}
								/>
							</div>
						</section>

						<!-- Limits -->
						<section class="jafar-panel">
							<header class="jafar-panel__head">
								<span class="jafar-panel__icon jafar-panel__icon--amber" aria-hidden="true">
									<i class="ri-bar-chart-2-line"></i>
								</span>
								<div>
									<h2 class="jafar-panel__title">Usage limits</h2>
									<p class="jafar-panel__sub">
										Hard caps enforced by usage counters. Use 0 for disabled or unlimited where
										noted.
									</p>
								</div>
							</header>
							<div class="jafar-panel__body">
								<LimitsEditor bind:limits />
							</div>
						</section>
					{/if}
				{:else if activeCategory === 'integrations'}
					<!-- Webchat widget config (shown only when feature_webchat is enabled) -->
					{#if org.feature_webchat}
						<section class="jafar-panel">
							<header class="jafar-panel__head">
								<span class="jafar-panel__icon jafar-panel__icon--teal" aria-hidden="true">
									<i class="ri-chat-3-line"></i>
								</span>
								<div>
									<h2 class="jafar-panel__title">Web Chat Widget</h2>
									<p class="jafar-panel__sub">
										Configure the embeddable chat widget for this org's website.
									</p>
								</div>
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
																webchatWidget.webchat_mode = mode.value as
																	| 'instant'
																	| 'asynchronous';
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
										<div class="jafar-wc__toggle-row jafar-subcard">
											<div>
												<p class="jafar-wc__toggle-title">Widget active</p>
												<p class="jafar-wc__toggle-desc">
													When disabled, the widget will not appear on any website.
												</p>
											</div>
											<button
												type="button"
												role="switch"
												aria-label="Toggle widget active"
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
											<label for="wc-intro" class="jafar-flabel">Intro message</label>
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
											<label for="wc-offline" class="jafar-flabel">Offline message</label>
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
												Leave empty to allow all origins. Add full origins like <code
													class="jafar-wc__code">https://example.com</code
												>.
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
												<div class="jafar-wc__domain-list">
													{#each webchatWidget.domain_allowlist as domain (domain)}
														<div class="jafar-wc__domain-item">
															<code class="jafar-wc__domain-code">{domain}</code>
															<button
																type="button"
																onclick={() => removeDomain(domain)}
																class="jafar-wc__domain-remove"
															>
																Remove
															</button>
														</div>
													{/each}
												</div>
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
														class="jafar-copy-chip"
														onclick={() => copyValue(webchatToken!, 'wc-token')}
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
													class="jafar-copy-chip jafar-wc__snippet-copy"
													onclick={() => copyValue(embedSnippet, 'snippet')}
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

					<!-- Email domain (Brevo) -->
					<EmailDomainPanel {orgId} />

					<!-- Integration status (read-only) -->
					<section class="jafar-panel">
						<header class="jafar-panel__head">
							<span class="jafar-panel__icon jafar-panel__icon--cyan" aria-hidden="true">
								<i class="ri-links-line"></i>
							</span>
							<div>
								<h2 class="jafar-panel__title">Integration status</h2>
								<p class="jafar-panel__sub">
									Read-only. Some features require both the flag above AND an active integration
									here (e.g. Stripe payments, Twilio SMS).
								</p>
							</div>
						</header>
						<div class="jafar-panel__body">
							<div class="jafar-connections">
								{#each connections as conn (conn.key)}
									<div class="jafar-connection">
										<div class="jafar-connection__left">
											<span class="jafar-connection__label">{conn.label}</span>
											<span class="jafar-connection__sub">
												{conn.connected && conn.detail ? conn.detail : conn.sublabel}
											</span>
										</div>
										<div class="jafar-connection__right">
											{#if conn.connected && conn.mode}
												<span
													class="jafar-badge"
													class:jafar-badge--mode-live={conn.mode === 'live'}
													class:jafar-badge--muted={conn.mode !== 'live'}
												>
													{conn.mode}
												</span>
											{/if}
											{#if conn.connected}
												<span class="jafar-badge jafar-badge--active">Connected</span>
											{:else}
												<span class="jafar-badge jafar-badge--muted">Not connected</span>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</div>
					</section>
				{/if}

				{#if fetchError && org}
					<p class="jafar-orgdetail__cached" role="status">
						{fetchError} Showing cached data.
					</p>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Sticky save bar -->
{#if dirty}
	<div class="jafar-save-bar">
		<div class="jafar-save-bar__note">
			<span class="jafar-save-bar__title">Unsaved changes</span>
			Plan, feature flags, or limits have been modified.
		</div>
		<button type="button" onclick={discardChanges} disabled={savingEntitlements} class="jafar-btn">
			Discard
		</button>
		<button
			type="button"
			onclick={saveEntitlements}
			disabled={savingEntitlements}
			class="jafar-btn jafar-btn--red"
		>
			{#if savingEntitlements}
				<i class="ri-loader-4-line j-spin" aria-hidden="true"></i>
				Saving…
			{:else}
				Save changes
			{/if}
		</button>
	</div>
{/if}
