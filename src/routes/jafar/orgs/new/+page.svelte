<script lang="ts">
	import { goto } from '$app/navigation';
	import PlanTemplateSelector from '$lib/components/jafar/PlanTemplateSelector.svelte';
	import FeatureFlagsEditor from '$lib/components/jafar/FeatureFlagsEditor.svelte';
	import LimitsEditor from '$lib/components/jafar/LimitsEditor.svelte';
	import PermissionMatrixEditor from '$lib/components/jafar/PermissionMatrixEditor.svelte';
	import { getPlanTemplate, type PlanName, type PlanTemplate } from '$lib/admin/planTemplates';
	import { fullAdminPermissions } from '$lib/permissions/permissions-matrix';
	import type { FeatureFlags, OrgLimits, PermissionKey } from '$lib/types';

	let submitting = $state(false);
	let errorMessage = $state<string | null>(null);

	let plan = $state<PlanName>('starter');
	const starter = getPlanTemplate('starter');
	let flags = $state<FeatureFlags>({ ...starter.flags });
	let limits = $state<OrgLimits>({ ...starter.limits });
	let adminPermissions = $state<Record<PermissionKey, boolean>>(fullAdminPermissions());

	function applyTemplate(t: PlanTemplate) {
		plan = t.plan;
		flags = { ...t.flags };
		limits = { ...t.limits };
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (submitting) return;

		submitting = true;
		errorMessage = null;

		const formData = new FormData(event.currentTarget as HTMLFormElement);
		const base = Object.fromEntries(formData.entries());

		const payload = {
			...base,
			plan,
			featureFlags: flags,
			limits,
			adminPermissions
		};

		try {
			const response = await fetch('/api/admin/orgs', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const result = await response.json().catch(() => ({}));

			if (!response.ok) {
				errorMessage = result?.error ?? 'Organization creation failed.';
				submitting = false;
				return;
			}

			await goto(`/jafar/orgs/${result.orgId}`);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Network error.';
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>New Organization · Jafar</title>
</svelte:head>

<div class="space-y-6">
	<!-- Breadcrumb / Back -->
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

	<!-- Header -->
	<div class="flex items-start gap-4">
		<span
			class="hidden size-12 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-gradient-to-br from-red-500/15 to-red-600/5 text-red-300 sm:inline-flex"
			aria-hidden="true"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="22"
				height="22"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M3 21h18" />
				<path d="M5 21V7l8-4v18" />
				<path d="M19 21v-8" />
				<path d="M16 16h6" />
				<path d="M19 13v6" />
			</svg>
		</span>
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-white sm:text-3xl">Create organization</h1>
			<p class="mt-1 text-sm text-slate-400">
				Provision a new tenant, seed its first admin, and set entitlements.
			</p>
		</div>
	</div>

	{#if errorMessage}
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
				<p class="font-semibold text-red-100">Could not create organization</p>
				<p class="mt-0.5 text-red-200/90">{errorMessage}</p>
			</div>
		</div>
	{/if}

	<form onsubmit={handleSubmit} class="space-y-6">
		<!-- Business details -->
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
					<h2 class="text-base font-semibold text-white">Business details</h2>
					<p class="mt-0.5 text-xs text-slate-500">Public identity and operating region.</p>
				</div>
			</header>

			<div class="grid gap-5 px-5 py-5 sm:grid-cols-2">
				<div class="space-y-1.5 sm:col-span-2">
					<label for="businessName" class="block text-xs font-semibold text-slate-300">
						Business name <span class="text-red-400">*</span>
					</label>
					<input
						id="businessName"
						name="businessName"
						required
						placeholder="Acme Plumbing & Heating"
						class="block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-red-500/60 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-colors"
					/>
				</div>

				<div class="space-y-1.5">
					<label for="slug" class="block text-xs font-semibold text-slate-300">
						Slug <span class="text-red-400">*</span>
					</label>
					<input
						id="slug"
						name="slug"
						required
						placeholder="acme-plumbing"
						class="block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm font-mono text-white placeholder:text-slate-600 focus:border-red-500/60 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-colors"
					/>
					<p class="text-[11px] text-slate-500">Lowercase, hyphen-separated. Used in URLs.</p>
				</div>

				<div class="space-y-1.5">
					<label for="tradeType" class="block text-xs font-semibold text-slate-300">
						Trade type <span class="text-red-400">*</span>
					</label>
					<input
						id="tradeType"
						name="tradeType"
						required
						placeholder="Plumbing"
						class="block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-red-500/60 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-colors"
					/>
				</div>

				<div class="space-y-1.5">
					<label for="city" class="block text-xs font-semibold text-slate-300">
						City <span class="text-red-400">*</span>
					</label>
					<input
						id="city"
						name="city"
						required
						placeholder="Austin"
						class="block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-red-500/60 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-colors"
					/>
				</div>

				<div class="space-y-1.5">
					<label for="state" class="block text-xs font-semibold text-slate-300">
						State <span class="text-red-400">*</span>
					</label>
					<input
						id="state"
						name="state"
						required
						placeholder="TX"
						class="block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-red-500/60 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-colors"
					/>
				</div>

				<div class="space-y-1.5 sm:col-span-2">
					<label for="timezone" class="block text-xs font-semibold text-slate-300">
						Timezone <span class="text-red-400">*</span>
					</label>
					<input
						id="timezone"
						name="timezone"
						value="America/Chicago"
						required
						class="block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm font-mono text-white placeholder:text-slate-600 focus:border-red-500/60 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-colors"
					/>
					<p class="text-[11px] text-slate-500">IANA timezone (e.g., America/Chicago).</p>
				</div>
			</div>
		</section>

		<!-- Telephony -->
		<section
			class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
		>
			<header class="flex items-center gap-3 border-b border-slate-800/80 px-5 py-4">
				<span
					class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
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
							d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
						/>
					</svg>
				</span>
				<div>
					<h2 class="text-base font-semibold text-white">Telephony</h2>
					<p class="mt-0.5 text-xs text-slate-500">Dedicated Twilio number for this tenant.</p>
				</div>
			</header>

			<div class="px-5 py-5">
				<div class="space-y-1.5">
					<label for="twilioPhoneNumber" class="block text-xs font-semibold text-slate-300">
						Twilio phone number
					</label>
					<input
						id="twilioPhoneNumber"
						name="twilioPhoneNumber"
						placeholder="+15125550123"
						class="block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm font-mono text-white placeholder:text-slate-600 focus:border-red-500/60 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-colors"
					/>
					<p class="text-[11px] text-slate-500">
						Optional — leave blank to provision later. E.164 format (e.g., +15125550123).
					</p>
				</div>
			</div>
		</section>

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
						Pre-fills flags + limits. Plan label is display-only; flags below are the entitlement.
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
						The authoritative entitlement layer. Tenants only get what's toggled on here.
					</p>
				</div>
			</header>
			<div class="px-5 py-5">
				<FeatureFlagsEditor bind:flags />
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
						Hard caps. Use 0 for disabled or unlimited, depending on the field.
					</p>
				</div>
			</header>
			<div class="px-5 py-5">
				<LimitsEditor bind:limits />
			</div>
		</section>

		<!-- Admin -->
		<section
			class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
		>
			<header class="flex items-center gap-3 border-b border-slate-800/80 px-5 py-4">
				<span
					class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-300"
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
						<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
						<circle cx="12" cy="7" r="4" />
					</svg>
				</span>
				<div>
					<h2 class="text-base font-semibold text-white">Initial admin</h2>
					<p class="mt-0.5 text-xs text-slate-500">
						First member of the organization. They will be prompted to change their password on
						login.
					</p>
				</div>
			</header>

			<div class="grid gap-5 px-5 py-5 sm:grid-cols-2">
				<div class="space-y-1.5 sm:col-span-2">
					<label for="adminFullName" class="block text-xs font-semibold text-slate-300">
						Full name <span class="text-red-400">*</span>
					</label>
					<input
						id="adminFullName"
						name="adminFullName"
						required
						placeholder="Jane Doe"
						class="block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-red-500/60 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-colors"
					/>
				</div>

				<div class="space-y-1.5">
					<label for="adminEmail" class="block text-xs font-semibold text-slate-300">
						Email <span class="text-red-400">*</span>
					</label>
					<input
						id="adminEmail"
						name="adminEmail"
						type="email"
						required
						placeholder="jane@acme.com"
						class="block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-red-500/60 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-colors"
					/>
				</div>

				<div class="space-y-1.5">
					<label for="adminTemporaryPassword" class="block text-xs font-semibold text-slate-300">
						Temporary password <span class="text-red-400">*</span>
					</label>
					<input
						id="adminTemporaryPassword"
						name="adminTemporaryPassword"
						type="password"
						required
						placeholder="••••••••••"
						class="block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-red-500/60 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-colors"
					/>
					<p class="text-[11px] text-slate-500">Admin must reset on first sign-in.</p>
				</div>
			</div>
		</section>

		<!-- Initial admin permissions -->
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
						<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
						<path d="m9 12 2 2 4-4" />
					</svg>
				</span>
				<div>
					<h2 class="text-base font-semibold text-white">Initial admin permissions</h2>
					<p class="mt-0.5 text-xs text-slate-500">
						Role is display metadata. These booleans are the actual authorization layer.
					</p>
				</div>
			</header>
			<div class="px-5 py-5">
				<PermissionMatrixEditor bind:permissions={adminPermissions} />
			</div>
		</section>

		<!-- Actions -->
		<div class="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
			<a
				href="/jafar/dashboard"
				class="inline-flex h-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 px-4 text-sm font-semibold text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white transition-colors"
			>
				Cancel
			</a>
			<button
				type="submit"
				disabled={submitting}
				class="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-red-500 to-red-600 px-5 text-sm font-semibold text-white shadow-md shadow-red-900/40 hover:from-red-500 hover:to-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-60 disabled:cursor-not-allowed transition-all cursor-pointer"
			>
				{#if submitting}
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
						class="animate-spin"
						aria-hidden="true"
					>
						<path d="M21 12a9 9 0 1 1-6.219-8.56" />
					</svg>
					Creating…
				{:else}
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
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					Create organization
				{/if}
			</button>
		</div>
	</form>
</div>
