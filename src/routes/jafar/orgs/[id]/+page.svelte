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
			<div class="min-w-0">
				<div class="flex flex-wrap items-center gap-3">
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

		<!-- Overview -->
		<section
			class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
		>
			<header class="border-b border-slate-800/80 px-5 py-4">
				<h2 class="text-base font-semibold text-white">Overview</h2>
				<p class="mt-0.5 text-xs text-slate-500">Tenant identity and operating region.</p>
			</header>

			<dl class="grid gap-px bg-slate-800/60 sm:grid-cols-2">
				<div class="bg-slate-900/50 px-5 py-4">
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

				<div class="bg-slate-900/50 px-5 py-4">
					<dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Slug</dt>
					<dd class="mt-1 font-mono text-sm text-white">{org.slug}</dd>
				</div>

				<div class="bg-slate-900/50 px-5 py-4">
					<dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Trade type</dt>
					<dd class="mt-1 text-sm text-white">{org.trade_type}</dd>
				</div>

				<div class="bg-slate-900/50 px-5 py-4">
					<dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Location</dt>
					<dd class="mt-1 text-sm text-white">
						{#if org.city || org.state}
							{[org.city, org.state].filter(Boolean).join(', ')}
						{:else}
							<span class="text-slate-500">—</span>
						{/if}
					</dd>
				</div>

				<div class="bg-slate-900/50 px-5 py-4">
					<dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Timezone</dt>
					<dd class="mt-1 font-mono text-sm text-white">{org.timezone}</dd>
				</div>

				<div class="bg-slate-900/50 px-5 py-4">
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

				<div class="bg-slate-900/50 px-5 py-4">
					<dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Created</dt>
					<dd class="mt-1 text-sm text-white">
						{new Date(org.created_at).toLocaleString()}
					</dd>
				</div>

				<div class="bg-slate-900/50 px-5 py-4">
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

		{#if seeded}
			<!-- Plan template -->
			<section
				class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
			>
				<header class="border-b border-slate-800/80 px-5 py-4">
					<h2 class="text-base font-semibold text-white">Plan template</h2>
					<p class="mt-0.5 text-xs text-slate-500">
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
				<header class="border-b border-slate-800/80 px-5 py-4">
					<h2 class="text-base font-semibold text-white">Feature flags</h2>
					<p class="mt-0.5 text-xs text-slate-500">
						The authoritative entitlement layer. Disable a flag and the tenant loses the feature — no
						role bypass.
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
				<header class="border-b border-slate-800/80 px-5 py-4">
					<h2 class="text-base font-semibold text-white">Usage limits</h2>
					<p class="mt-0.5 text-xs text-slate-500">
						Hard caps enforced by usage counters. Use 0 for disabled or unlimited where noted.
					</p>
				</header>
				<div class="px-5 py-5">
					<LimitsEditor bind:limits />
				</div>
			</section>
		{/if}

		<!-- Integration status (read-only) -->
		<section
			class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
		>
			<header class="border-b border-slate-800/80 px-5 py-4">
				<h2 class="text-base font-semibold text-white">Integration status</h2>
				<p class="mt-0.5 text-xs text-slate-500">
					Read-only. Some features require both the flag above AND an active integration here (e.g.
					Stripe payments, Twilio SMS).
				</p>
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

		<!-- Lifecycle actions -->
		<section
			class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
		>
			<header class="border-b border-slate-800/80 px-5 py-4">
				<h2 class="text-base font-semibold text-white">Lifecycle actions</h2>
				<p class="mt-0.5 text-xs text-slate-500">
					Change tenant status or finalize provisioning. Actions take effect immediately.
				</p>
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

		{#if fetchError && org}
			<p class="text-xs text-amber-400/80" role="status">
				{fetchError} Showing cached data.
			</p>
		{/if}
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
				<p class="text-[11px] text-slate-400">
					Plan, feature flags, or limits have been modified.
				</p>
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
