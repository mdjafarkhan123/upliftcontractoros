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

<div class="new-org">
	<a href="/jafar/dashboard" class="jafar-back">
		<i class="ri-arrow-left-s-line" aria-hidden="true"></i>
		Back to dashboard
	</a>

	<div class="jafar-page-hd">
		<span class="jafar-page-hd__icon" aria-hidden="true">
			<i class="ri-community-line"></i>
		</span>
		<div>
			<h1>Create organization</h1>
			<p>Provision a new tenant, seed its first admin, and set entitlements.</p>
		</div>
	</div>

	{#if errorMessage}
		<div role="alert" class="jafar-alert jafar-alert--error">
			<span class="jafar-alert__icon"><i class="ri-error-warning-line" aria-hidden="true"></i></span>
			<div>
				<p class="jafar-alert__title">Could not create organization</p>
				<p class="jafar-alert__text">{errorMessage}</p>
			</div>
		</div>
	{/if}

	<form onsubmit={handleSubmit} class="new-org__form">
		<!-- Business details -->
		<section class="jafar-panel">
			<header class="jafar-panel__head">
				<span class="jafar-panel__icon jafar-panel__icon--sky" aria-hidden="true">
					<i class="ri-building-line"></i>
				</span>
				<div>
					<h2 class="jafar-panel__title">Business details</h2>
					<p class="jafar-panel__sub">Public identity and operating region.</p>
				</div>
			</header>

			<div class="org-grid">
				<div class="org-field org-grid__full">
					<label for="businessName" class="org-lbl">
						Business name <span class="org-req">*</span>
					</label>
					<input
						id="businessName"
						name="businessName"
						required
						placeholder="Acme Plumbing & Heating"
						class="jafar-input"
					/>
				</div>

				<div class="org-field">
					<label for="slug" class="org-lbl">
						Slug <span class="org-req">*</span>
					</label>
					<input
						id="slug"
						name="slug"
						required
						placeholder="acme-plumbing"
						class="jafar-input jafar-input--mono"
					/>
					<p class="org-hint">Lowercase, hyphen-separated. Used in URLs.</p>
				</div>

				<div class="org-field">
					<label for="tradeType" class="org-lbl">
						Trade type <span class="org-req">*</span>
					</label>
					<input
						id="tradeType"
						name="tradeType"
						required
						placeholder="Plumbing"
						class="jafar-input"
					/>
				</div>

				<div class="org-field">
					<label for="city" class="org-lbl">
						City <span class="org-req">*</span>
					</label>
					<input
						id="city"
						name="city"
						required
						placeholder="Austin"
						class="jafar-input"
					/>
				</div>

				<div class="org-field">
					<label for="state" class="org-lbl">
						State <span class="org-req">*</span>
					</label>
					<input
						id="state"
						name="state"
						required
						placeholder="TX"
						class="jafar-input"
					/>
				</div>

				<div class="org-field org-grid__full">
					<label for="timezone" class="org-lbl">
						Timezone <span class="org-req">*</span>
					</label>
					<input
						id="timezone"
						name="timezone"
						value="America/Chicago"
						required
						class="jafar-input jafar-input--mono"
					/>
					<p class="org-hint">IANA timezone (e.g., America/Chicago).</p>
				</div>
			</div>
		</section>

		<!-- Telephony -->
		<section class="jafar-panel">
			<header class="jafar-panel__head">
				<span class="jafar-panel__icon jafar-panel__icon--emerald" aria-hidden="true">
					<i class="ri-phone-line"></i>
				</span>
				<div>
					<h2 class="jafar-panel__title">Telephony</h2>
					<p class="jafar-panel__sub">Dedicated Twilio number for this tenant.</p>
				</div>
			</header>

			<div class="jafar-panel__body">
				<div class="org-field">
					<label for="twilioPhoneNumber" class="org-lbl">Twilio phone number</label>
					<input
						id="twilioPhoneNumber"
						name="twilioPhoneNumber"
						placeholder="+15125550123"
						class="jafar-input jafar-input--mono"
					/>
					<p class="org-hint">
						Optional — leave blank to provision later. E.164 format (e.g., +15125550123).
					</p>
				</div>
			</div>
		</section>

		<!-- Plan template -->
		<section class="jafar-panel">
			<header class="jafar-panel__head">
				<span class="jafar-panel__icon jafar-panel__icon--violet" aria-hidden="true">
					<i class="ri-checkbox-circle-line"></i>
				</span>
				<div>
					<h2 class="jafar-panel__title">Plan template</h2>
					<p class="jafar-panel__sub">
						Pre-fills flags + limits. Plan label is display-only; flags below are the entitlement.
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
						The authoritative entitlement layer. Tenants only get what's toggled on here.
					</p>
				</div>
			</header>
			<div class="jafar-panel__body">
				<FeatureFlagsEditor bind:flags />
			</div>
		</section>

		<!-- Limits -->
		<section class="jafar-panel">
			<header class="jafar-panel__head">
				<span class="jafar-panel__icon jafar-panel__icon--amber" aria-hidden="true">
					<i class="ri-bar-chart-box-line"></i>
				</span>
				<div>
					<h2 class="jafar-panel__title">Usage limits</h2>
					<p class="jafar-panel__sub">
						Hard caps. Use 0 for disabled or unlimited, depending on the field.
					</p>
				</div>
			</header>
			<div class="jafar-panel__body">
				<LimitsEditor bind:limits />
			</div>
		</section>

		<!-- Initial admin -->
		<section class="jafar-panel">
			<header class="jafar-panel__head">
				<span class="jafar-panel__icon jafar-panel__icon--blue" aria-hidden="true">
					<i class="ri-user-line"></i>
				</span>
				<div>
					<h2 class="jafar-panel__title">Initial admin</h2>
					<p class="jafar-panel__sub">
						First member of the organization. They will be prompted to change their password on login.
					</p>
				</div>
			</header>

			<div class="org-grid">
				<div class="org-field org-grid__full">
					<label for="adminFullName" class="org-lbl">
						Full name <span class="org-req">*</span>
					</label>
					<input
						id="adminFullName"
						name="adminFullName"
						required
						placeholder="Jane Doe"
						class="jafar-input"
					/>
				</div>

				<div class="org-field">
					<label for="adminEmail" class="org-lbl">
						Email <span class="org-req">*</span>
					</label>
					<input
						id="adminEmail"
						name="adminEmail"
						type="email"
						required
						placeholder="jane@acme.com"
						class="jafar-input"
					/>
				</div>

				<div class="org-field">
					<label for="adminTemporaryPassword" class="org-lbl">
						Temporary password <span class="org-req">*</span>
					</label>
					<input
						id="adminTemporaryPassword"
						name="adminTemporaryPassword"
						type="password"
						required
						placeholder="••••••••••"
						class="jafar-input"
					/>
					<p class="org-hint">Admin must reset on first sign-in.</p>
				</div>
			</div>
		</section>

		<!-- Initial admin permissions -->
		<section class="jafar-panel">
			<header class="jafar-panel__head">
				<span class="jafar-panel__icon jafar-panel__icon--rose" aria-hidden="true">
					<i class="ri-shield-check-line"></i>
				</span>
				<div>
					<h2 class="jafar-panel__title">Initial admin permissions</h2>
					<p class="jafar-panel__sub">
						Role is display metadata. These booleans are the actual authorization layer.
					</p>
				</div>
			</header>
			<div class="jafar-panel__body">
				<PermissionMatrixEditor bind:permissions={adminPermissions} />
			</div>
		</section>

		<div class="new-org__actions">
			<a href="/jafar/dashboard" class="jafar-btn">Cancel</a>
			<button type="submit" disabled={submitting} class="jafar-btn jafar-btn--red jafar-btn--lg">
				{#if submitting}
					<i class="ri-loader-4-line j-spin" aria-hidden="true"></i>
					Creating…
				{:else}
					<i class="ri-add-line" aria-hidden="true"></i>
					Create organization
				{/if}
			</button>
		</div>
	</form>
</div>

<style lang="scss">
	.new-org {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;

		&__form {
			display: flex;
			flex-direction: column;
			gap: 1.5rem;
		}

		&__actions {
			display: flex;
			flex-direction: column-reverse;
			gap: 0.75rem;
			@media (min-width: 640px) {
				flex-direction: row;
				align-items: center;
				justify-content: flex-end;
			}
		}
	}

	.org-grid {
		display: grid;
		gap: 1.25rem;
		padding: 1.25rem;
		@media (min-width: 640px) { grid-template-columns: 1fr 1fr; }

		&__full {
			@media (min-width: 640px) { grid-column: 1 / -1; }
		}
	}

	.org-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.org-lbl {
		display: block;
		font-size: 0.75rem;
		font-weight: 600;
		color: #cbd5e1;
	}

	.org-req { color: #ef4444; }

	.org-hint {
		font-size: 0.6875rem;
		color: #64748b;
	}
</style>
