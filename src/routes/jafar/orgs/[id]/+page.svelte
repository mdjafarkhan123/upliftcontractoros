<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import PlanTemplateSelector from '$lib/components/jafar/PlanTemplateSelector.svelte';
	import FeatureFlagsEditor from '$lib/components/jafar/FeatureFlagsEditor.svelte';
	import LimitsEditor from '$lib/components/jafar/LimitsEditor.svelte';
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
	let seeded = $state(false);
	let seededOrgId = $state<string | null>(null);

	// Frozen snapshot of last seeded values — drives dirty without serialization.
	type Baseline = { plan: PlanName; flags: FeatureFlags; limits: OrgLimits };
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
			plan = seedPlan;
			flags = { ...seedFlags };
			limits = { ...seedLimits };
			baseline = { plan: seedPlan, flags: seedFlags, limits: seedLimits };
			seeded = true;
			mark('seed-complete');
		}
	});

	const dirty = $derived.by(() => {
		if (!seeded || !baseline) return false;
		if (plan !== baseline.plan) return true;
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
		active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
		suspended: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
		pending_deletion: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
		deleted: 'border-red-500/30 bg-red-500/10 text-red-300'
	};

	const statusLabels: Record<Org['status'], string> = {
		active: 'Active',
		suspended: 'Suspended',
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
				body: JSON.stringify({ plan, featureFlags: flags, limits })
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

	const integrationEntries = $derived(
		org ? (Object.entries(org.integration_status ?? {}) as [string, unknown][]) : []
	);

	// Up-to-two-letter monogram for the org avatar tile in the hero.
	const orgInitials = $derived(
		(org?.name ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('') || '—'
	);

	type Category = 'general' | 'entitlements' | 'integrations';
	let activeCategory = $state<Category>('general');

	const categoryItems = [
		{
			id: 'general' as Category,
			label: 'General',
			desc: 'Identity, status & actions',
			svgPath: 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4'
		},
		{
			id: 'entitlements' as Category,
			label: 'Entitlements',
			desc: 'Plan, flags & limits',
			svgPath: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22V15'
		},
		{
			id: 'integrations' as Category,
			label: 'Integrations',
			desc: 'Chat, email & connections',
			svgPath: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'
		}
	] as const;
</script>

<svelte:head>
	<title>{org ? `${org.name} · Jafar` : 'Organization · Jafar'}</title>
</svelte:head>

<div class="space-y-6 pb-32">
	<!-- Back (always instant) -->
	<div>
		<a
			href="/jafar/dashboard"
			class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<polyline points="15 18 9 12 15 6" />
			</svg>
			Back to dashboard
		</a>
	</div>

	{#if showSkeleton}
		<AdminHeaderSkeleton />
		<AdminSectionSkeleton titleWidth="w-24" bodyRows={4} grid />
		<AdminSectionSkeleton titleWidth="w-32" bodyRows={3} />
		<AdminSectionSkeleton titleWidth="w-32" bodyRows={6} grid />
		<AdminSectionSkeleton titleWidth="w-28" bodyRows={3} grid />
	{:else if showError}
		<div
			role="alert"
			class="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-6 text-center"
		>
			<p class="text-sm font-semibold text-red-200">Failed to load organization</p>
			<p class="mt-1 text-xs text-red-300/80">{fetchError ?? 'Unknown error.'}</p>
			<button
				type="button"
				onclick={() => jafarOrgStore.refresh(orgId)}
				class="mt-4 inline-flex h-9 items-center rounded-lg border border-red-500/40 bg-red-500/10 px-3 text-xs font-semibold text-red-100 hover:border-red-400/60 hover:bg-red-500/20 transition-colors cursor-pointer"
			>
				Retry
			</button>
		</div>
	{:else if org}
		<!-- Header -->
		<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div class="flex min-w-0 items-start gap-4">
				<span
					class="hidden size-12 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900 text-base font-bold tracking-tight text-slate-200 shadow-inner shadow-black/40 sm:inline-flex"
					aria-hidden="true"
				>
					{orgInitials}
				</span>
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2.5">
						<h1 class="text-2xl font-bold tracking-tight text-white sm:text-3xl">
							{org.name}
						</h1>
						<span
							class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide {statusStyles[
								org.status
							]}"
						>
							<span class="size-1.5 rounded-full bg-current"></span>
							{statusLabels[org.status]}
						</span>
						{#if org.is_setup_complete}
							<span
								class="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-300"
							>
								Setup complete
							</span>
						{:else}
							<span
								class="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
							>
								Setup pending
							</span>
						{/if}
						{#if status === 'revalidating'}
							<span class="inline-flex items-center gap-1 text-[11px] text-slate-500">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="10"
									height="10"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.4"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="animate-spin"
									aria-hidden="true"
								>
									<path d="M21 12a9 9 0 1 1-6.219-8.56" />
								</svg>
								Refreshing
							</span>
						{/if}
					</div>
					<p class="mt-1.5 text-sm text-slate-400">
						<span class="font-mono text-slate-500">/{org.slug}</span>
						<span class="mx-1.5 text-slate-700">·</span>
						{org.trade_type}
					</p>
				</div>
			</div>
		</div>

		{#if actionError}
			<div
				role="alert"
				class="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="mt-0.5 shrink-0 text-red-300"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
				<div>
					<p class="font-semibold text-red-100">Action failed</p>
					<p class="mt-0.5 text-red-200/90">{actionError}</p>
				</div>
			</div>
		{/if}

		{#if saved && !dirty}
			<div
				role="status"
				class="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.4"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<polyline points="20 6 9 17 4 12" />
				</svg>
				Entitlements saved.
			</div>
		{/if}

		<!-- Settings: sidebar + content panel -->
		<div class="flex gap-6 items-start">
			<!-- Sidebar nav -->
			<aside class="w-56 shrink-0 sticky top-4 self-start">
				<nav
					class="rounded-xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
				>
					<div class="px-3 pt-3 pb-1">
						<p class="px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
							Settings
						</p>
					</div>
					<div class="px-1.5 pb-1.5 space-y-0.5">
						{#each categoryItems as cat (cat.id)}
							<button
								type="button"
								onclick={() => (activeCategory = cat.id)}
								class="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-all duration-150 ease-out cursor-pointer min-h-[44px]
									{activeCategory === cat.id
										? 'bg-emerald-500/20 text-emerald-100 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.15)]'
										: 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}"
							>
								<span
									class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors duration-150
										{activeCategory === cat.id
											? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
											: 'border-slate-700 bg-slate-800/40 text-slate-500 group-hover:border-slate-600 group-hover:text-slate-300'}"
									aria-hidden="true"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="15"
										height="15"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										{#each cat.svgPath.split(/(?=M)/) as part}
											<path d={part} />
										{/each}
									</svg>
								</span>
								<div class="min-w-0">
									<p class="text-sm font-semibold leading-tight">{cat.label}</p>
									<p class="text-[10px] leading-tight text-slate-500">{cat.desc}</p>
								</div>
							</button>
						{/each}
					</div>
				</nav>
			</aside>

			<!-- Content panel -->
			<div class="flex-1 min-w-0 space-y-4">
				{#if activeCategory === 'general'}
					<!-- Overview -->
					<section
						class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
					>
						<header class="flex items-center gap-3 border-b border-slate-800/80 px-5 py-4">
							<span
								class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300"
								aria-hidden="true"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="17"
									height="17"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M3 21h18" />
									<path d="M5 21V7l8-4v18" />
									<path d="M19 21V11l-6-4" />
								</svg>
							</span>
							<div>
								<h2 class="text-base font-semibold text-white">Overview</h2>
								<p class="mt-0.5 text-xs text-slate-500">Tenant identity and operating region.</p>
							</div>
						</header>

						<dl class="grid gap-px bg-slate-800/60 sm:grid-cols-2">
							<div class="bg-slate-900/50 px-5 py-4 transition-colors hover:bg-slate-900/80">
								<dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
									Organization ID
								</dt>
								<dd class="mt-1 flex items-center gap-2">
									<code class="truncate font-mono text-xs text-slate-200">{org.id}</code>
									<button
										type="button"
										onclick={() => copyValue(org!.id, 'id')}
										class="shrink-0 rounded-md border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:border-slate-600 hover:text-white transition-colors"
									>
										{copied === 'id' ? 'Copied' : 'Copy'}
									</button>
								</dd>
							</div>

							<div class="bg-slate-900/50 px-5 py-4 transition-colors hover:bg-slate-900/80">
								<dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Slug</dt>
								<dd class="mt-1 font-mono text-sm text-white">{org.slug}</dd>
							</div>

							<div class="bg-slate-900/50 px-5 py-4 transition-colors hover:bg-slate-900/80">
								<dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
									Trade type
								</dt>
								<dd class="mt-1 text-sm text-white">{org.trade_type}</dd>
							</div>

							<div class="bg-slate-900/50 px-5 py-4 transition-colors hover:bg-slate-900/80">
								<dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Location</dt>
								<dd class="mt-1 text-sm text-white">
									{#if org.city || org.state}
										{[org.city, org.state].filter(Boolean).join(', ')}
									{:else}
										<span class="text-slate-500">—</span>
									{/if}
								</dd>
							</div>

							<div class="bg-slate-900/50 px-5 py-4 transition-colors hover:bg-slate-900/80">
								<dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Timezone</dt>
								<dd class="mt-1 font-mono text-sm text-white">{org.timezone}</dd>
							</div>

							<div class="bg-slate-900/50 px-5 py-4 transition-colors hover:bg-slate-900/80">
								<dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
									Twilio phone
								</dt>
								<dd class="mt-1 flex items-center gap-2">
									<span class="font-mono text-sm text-white">{org.twilio_phone_number}</span>
									<button
										type="button"
										onclick={() => copyValue(org!.twilio_phone_number, 'phone')}
										class="shrink-0 rounded-md border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:border-slate-600 hover:text-white transition-colors"
									>
										{copied === 'phone' ? 'Copied' : 'Copy'}
									</button>
								</dd>
							</div>

							<div class="bg-slate-900/50 px-5 py-4 transition-colors hover:bg-slate-900/80">
								<dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Created</dt>
								<dd class="mt-1 text-sm text-white">
									{new Date(org.created_at).toLocaleString()}
								</dd>
							</div>

							<div class="bg-slate-900/50 px-5 py-4 transition-colors hover:bg-slate-900/80">
								<dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
									Entitlements updated
								</dt>
								<dd class="mt-1 text-sm text-white">
									{#if org.feature_overrides_updated_at}
										{new Date(org.feature_overrides_updated_at).toLocaleString()}
									{:else}
										<span class="text-slate-500">Never</span>
									{/if}
								</dd>
							</div>
						</dl>
					</section>

					<!-- Lifecycle actions -->
					<section
						class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
					>
						<header class="flex items-center gap-3 border-b border-slate-800/80 px-5 py-4">
							<span
								class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300"
								aria-hidden="true"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="17"
									height="17"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M12 2v10" />
									<path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
								</svg>
							</span>
							<div>
								<h2 class="text-base font-semibold text-white">Lifecycle actions</h2>
								<p class="mt-0.5 text-xs text-slate-500">
									Change tenant status or finalize provisioning. Actions take effect immediately.
								</p>
							</div>
						</header>

						<div class="grid gap-3 px-5 py-5 sm:grid-cols-3">
							<button
								type="button"
								disabled={updating || org.status === 'active'}
								onclick={() => updateStatus('active')}
								class="group flex flex-col items-start gap-1.5 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-left hover:border-emerald-500/40 hover:bg-emerald-500/5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-800 disabled:hover:bg-slate-950/40 transition-colors cursor-pointer"
							>
								<span
									class="inline-flex size-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.4"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<polyline points="20 6 9 17 4 12" />
									</svg>
								</span>
								<span class="text-sm font-semibold text-white">Set active</span>
								<span class="text-[11px] text-slate-500">Tenant can log in and operate.</span>
							</button>

							<button
								type="button"
								disabled={updating || org.status === 'suspended'}
								onclick={() => updateStatus('suspended')}
								class="group flex flex-col items-start gap-1.5 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-left hover:border-amber-500/40 hover:bg-amber-500/5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-800 disabled:hover:bg-slate-950/40 transition-colors cursor-pointer"
							>
								<span
									class="inline-flex size-8 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.4"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<rect x="6" y="5" width="4" height="14" />
										<rect x="14" y="5" width="4" height="14" />
									</svg>
								</span>
								<span class="text-sm font-semibold text-white">Suspend</span>
								<span class="text-[11px] text-slate-500">Block access without deleting data.</span>
							</button>

							<button
								type="button"
								disabled={updating || org.is_setup_complete}
								onclick={completeSetup}
								class="group flex flex-col items-start gap-1.5 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-left hover:border-sky-500/40 hover:bg-sky-500/5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-800 disabled:hover:bg-slate-950/40 transition-colors cursor-pointer"
							>
								<span
									class="inline-flex size-8 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.4"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
										<polyline points="22 4 12 14.01 9 11.01" />
									</svg>
								</span>
								<span class="text-sm font-semibold text-white">Complete setup</span>
								<span class="text-[11px] text-slate-500">Mark provisioning as finalized.</span>
							</button>
						</div>

						{#if updating}
							<div
								class="flex items-center gap-2 border-t border-slate-800/80 bg-slate-950/40 px-5 py-3 text-xs text-slate-400"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.4"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="animate-spin"
									aria-hidden="true"
								>
									<path d="M21 12a9 9 0 1 1-6.219-8.56" />
								</svg>
								Applying change…
							</div>
						{/if}
					</section>

				{:else if activeCategory === 'entitlements'}
					{#if seeded}
						<!-- Plan template -->
						<section
							class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
						>
							<header class="flex items-center gap-3 border-b border-slate-800/80 px-5 py-4">
								<span
									class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-300"
									aria-hidden="true"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="17"
										height="17"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path
											d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
										/>
										<path d="m9 12 2 2 4-4" />
									</svg>
								</span>
								<div>
									<h2 class="text-base font-semibold text-white">Plan template</h2>
									<p class="mt-0.5 text-xs text-slate-500">
										Plan is display metadata. Feature flags below are the real entitlement system.
									</p>
								</div>
							</header>
							<div class="px-5 py-5">
								<PlanTemplateSelector bind:value={plan} onApply={applyTemplate} />
							</div>
						</section>

						<!-- Feature flags -->
						<section
							class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
						>
							<header class="flex items-center gap-3 border-b border-slate-800/80 px-5 py-4">
								<span
									class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
									aria-hidden="true"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="17"
										height="17"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
										<line x1="4" y1="22" x2="4" y2="15" />
									</svg>
								</span>
								<div>
									<h2 class="text-base font-semibold text-white">Feature flags</h2>
									<p class="mt-0.5 text-xs text-slate-500">
										The authoritative entitlement layer. Disable a flag and the tenant loses the feature —
										no role bypass.
									</p>
								</div>
							</header>
							<div class="px-5 py-5">
								<FeatureFlagsEditor bind:flags integrationStatus={org.integration_status ?? {}} />
							</div>
						</section>

						<!-- Limits -->
						<section
							class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
						>
							<header class="flex items-center gap-3 border-b border-slate-800/80 px-5 py-4">
								<span
									class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300"
									aria-hidden="true"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="17"
										height="17"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M12 20v-6" />
										<path d="M6 20V10" />
										<path d="M18 20V4" />
									</svg>
								</span>
								<div>
									<h2 class="text-base font-semibold text-white">Usage limits</h2>
									<p class="mt-0.5 text-xs text-slate-500">
										Hard caps enforced by usage counters. Use 0 for disabled or unlimited where noted.
									</p>
								</div>
							</header>
							<div class="px-5 py-5">
								<LimitsEditor bind:limits />
							</div>
						</section>
					{/if}

				{:else if activeCategory === 'integrations'}
					<!-- Webchat widget config (shown only when feature_webchat is enabled) -->
					{#if org.feature_webchat}
						<section
							class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
						>
							<header class="flex items-center gap-3 border-b border-slate-800/80 px-5 py-4">
								<span
									class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-300"
									aria-hidden="true"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="17"
										height="17"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
									</svg>
								</span>
								<div>
									<h2 class="text-base font-semibold text-white">Web Chat Widget</h2>
									<p class="mt-0.5 text-xs text-slate-500">
										Configure the embeddable chat widget for this org's website.
									</p>
								</div>
							</header>

							<div class="px-5 py-5 space-y-5">
								{#if webchatLoading}
									<p class="text-sm text-slate-400">Loading widget configuration…</p>
								{:else if webchatWidget}
									<!-- Mode selector -->
									<div class="space-y-2">
										<label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
														: 'border-slate-700 bg-slate-950/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'}"
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
											<p class="text-[11px] text-slate-500">
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
												{webchatWidget.is_active ? 'bg-indigo-600' : 'bg-slate-700'}"
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
											class="block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
										>
											Intro message
										</label>
										<textarea
											id="wc-intro"
											rows={3}
											bind:value={webchatWidget.intro_message}
											class="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-indigo-500/60"
										></textarea>
										<p class="text-[11px] text-slate-500 italic">
											Preview: "{webchatWidget.intro_message}"
										</p>
									</div>

									<!-- Offline message -->
									<div class="space-y-1.5">
										<label
											for="wc-offline"
											class="block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
										>
											Offline message
										</label>
										<textarea
											id="wc-offline"
											rows={3}
											bind:value={webchatWidget.offline_message}
											class="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-indigo-500/60"
										></textarea>
										<p class="text-[11px] text-slate-500 italic">
											Preview: "{webchatWidget.offline_message}"
										</p>
									</div>

									<!-- Domain allowlist -->
									<div class="space-y-2">
										<label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
											Domain allowlist
										</label>
										<p class="text-[11px] text-slate-500">
											Leave empty to allow all origins. Add full origins like <code
												class="font-mono text-slate-400">https://example.com</code
											>.
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
												class="flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-indigo-500/60"
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
														<code class="font-mono text-xs text-slate-300">{domain}</code>
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
											<p class="text-[11px] text-slate-500">No domains added — all origins permitted.</p>
										{/if}
									</div>

									<!-- Widget token (immutable) -->
									<div class="space-y-1.5">
										<label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
											Widget token
										</label>
										<p class="text-[11px] text-slate-500">Generated once. Immutable. Never editable.</p>
										<div class="flex items-center gap-2">
											<code
												class="flex-1 truncate font-mono text-xs text-slate-300 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2"
											>
												{webchatToken ?? '—'}
											</code>
											{#if webchatToken}
												<button
													type="button"
													onclick={() => copyValue(webchatToken!, 'wc-token')}
													class="shrink-0 rounded-md border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:border-slate-600 hover:text-white transition-colors cursor-pointer"
												>
													{copied === 'wc-token' ? 'Copied' : 'Copy'}
												</button>
											{/if}
										</div>
									</div>

									<!-- Embed snippet -->
									<div class="space-y-1.5">
										<label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
											Embed snippet
										</label>
										<p class="text-[11px] text-slate-500">
											Paste this into the <code class="font-mono text-slate-400">&lt;head&gt;</code> of the
											contractor's website.
										</p>
										<div class="relative">
											<pre
												class="overflow-x-auto rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-xs text-emerald-300 leading-relaxed">{embedSnippet}</pre>
											<button
												type="button"
												onclick={() => copyValue(embedSnippet, 'snippet')}
												class="absolute right-2 top-2 rounded-md border border-slate-700 bg-slate-800/80 px-2 py-1 text-[10px] font-semibold text-slate-400 hover:border-slate-600 hover:text-white transition-colors cursor-pointer"
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

					<!-- Email domain (Brevo) -->
					<EmailDomainPanel {orgId} />

					<!-- Integration status (read-only) -->
					<section
						class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
					>
						<header class="flex items-center gap-3 border-b border-slate-800/80 px-5 py-4">
							<span
								class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
								aria-hidden="true"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="17"
									height="17"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
									<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
								</svg>
							</span>
							<div>
								<h2 class="text-base font-semibold text-white">Integration status</h2>
								<p class="mt-0.5 text-xs text-slate-500">
									Read-only. Some features require both the flag above AND an active integration here
									(e.g. Stripe payments, Twilio SMS).
								</p>
							</div>
						</header>
						<div class="px-5 py-5">
							{#if integrationEntries.length === 0}
								<p class="text-sm text-slate-500">No integrations connected yet.</p>
							{:else}
								<dl class="grid gap-px overflow-hidden rounded-xl bg-slate-800/60 sm:grid-cols-2">
									{#each integrationEntries as [key, value] (key)}
										<div class="flex items-center justify-between gap-3 bg-slate-950/40 px-4 py-3">
											<dt class="font-mono text-xs text-slate-300">{key}</dt>
											<dd>
												{#if value === true}
													<span
														class="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300"
													>
														Connected
													</span>
												{:else if value === false}
													<span
														class="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
													>
														Disconnected
													</span>
												{:else}
													<span class="font-mono text-xs text-slate-300">{String(value)}</span>
												{/if}
											</dd>
										</div>
									{/each}
								</dl>
							{/if}
						</div>
					</section>
				{/if}

				{#if fetchError && org}
					<p class="text-xs text-amber-400/80" role="status">
						{fetchError} Showing cached data.
					</p>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Sticky save bar -->
{#if dirty}
	<div
		class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 backdrop-blur-md"
	>
		<div class="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3 sm:px-8">
			<div class="min-w-0">
				<p class="text-sm font-semibold text-white">Unsaved changes</p>
				<p class="text-[11px] text-slate-400">Plan, feature flags, or limits have been modified.</p>
			</div>
			<div class="flex shrink-0 items-center gap-2">
				<button
					type="button"
					onclick={discardChanges}
					disabled={savingEntitlements}
					class="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
				>
					Discard
				</button>
				<button
					type="button"
					onclick={saveEntitlements}
					disabled={savingEntitlements}
					class="inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-red-500 to-red-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-red-900/40 hover:from-red-500 hover:to-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all cursor-pointer"
				>
					{#if savingEntitlements}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.4"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="animate-spin"
							aria-hidden="true"
						>
							<path d="M21 12a9 9 0 1 1-6.219-8.56" />
						</svg>
						Saving…
					{:else}
						Save changes
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
