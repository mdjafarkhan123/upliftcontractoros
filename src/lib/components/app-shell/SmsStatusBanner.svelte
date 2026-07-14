<script lang="ts">
	import { smsCountrySupport } from '$lib/utils/countries';

	// SMS activation banners (Onboarding.md Parts 4, 6 & 7).
	//   Case B — SMS enabled, no number  → info banner + CTA to set up a number.
	//   Carrier skipped — SMS enabled, has number, pending, gated market (US/CA) but
	//            the carrier details were never filled → amber "action needed" banner;
	//            the PO can't register the number until these are submitted. Takes
	//            precedence over the generic pending banner. Non-dismissible.
	//   Case C — SMS enabled, has number, approval pending (carrier details on file) →
	//            red "pending approval" banner; dismissible but reappears on refresh.
	// Anything else (SMS disabled, approved, not_required) renders nothing.
	let {
		smsEnabled,
		hasNumber,
		approvalStatus,
		country,
		carrierComplete
	} = $props<{
		smsEnabled: boolean;
		hasNumber: boolean;
		approvalStatus: 'not_required' | 'pending' | 'approved' | 'rejected';
		country: string | null;
		carrierComplete: boolean;
	}>();

	let pendingDismissed = $state(false);

	const showNoNumber = $derived(smsEnabled && !hasNumber);
	const showCarrierIncomplete = $derived(
		smsEnabled &&
			hasNumber &&
			approvalStatus === 'pending' &&
			smsCountrySupport(country) === 'gated' &&
			!carrierComplete
	);
	const showPending = $derived(
		smsEnabled &&
			hasNumber &&
			approvalStatus === 'pending' &&
			!showCarrierIncomplete &&
			!pendingDismissed
	);
</script>

{#if showCarrierIncomplete}
	<div
		class="flex items-start gap-3 border-b border-amber-200/60 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100"
	>
		<i class="ri-alert-line mt-0.5 shrink-0" aria-hidden="true"></i>
		<div class="flex-1 leading-snug">
			<span class="font-medium">Finish carrier registration.</span>
			<span class="ml-1">
				Outbound texting stays off until you submit your business details.
			</span>
			<a
				href="/settings/integrations"
				class="ml-1 underline underline-offset-2 hover:no-underline"
			>
				Complete it now
			</a>
		</div>
	</div>
{:else if showPending}
	<div
		class="flex items-start gap-3 border-b border-red-200/60 bg-red-50 px-4 py-2.5 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-100"
	>
		<i class="ri-time-line mt-0.5 shrink-0" aria-hidden="true"></i>
		<div class="flex-1 leading-snug">
			<span class="font-medium">SMS Messaging Pending Approval.</span>
			<span class="ml-1"
				>Your number is active for calls and incoming texts. Outbound SMS will be enabled after
				approval (5–10 business days).</span
			>
		</div>
		<button
			type="button"
			onclick={() => (pendingDismissed = true)}
			class="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-700 transition-colors hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900/40"
			aria-label="Dismiss"
		>
			<i class="ri-close-line" aria-hidden="true"></i>
		</button>
	</div>
{:else if showNoNumber}
	<div
		class="flex items-center gap-3 border-b border-sky-200/60 bg-sky-50 px-4 py-2.5 text-sm text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-100"
	>
		<i class="ri-message-line shrink-0" aria-hidden="true"></i>
		<div class="flex-1 leading-snug">
			<span class="font-medium">SMS is now available.</span>
			<a
				href="/settings/integrations"
				class="ml-2 underline underline-offset-2 hover:no-underline">Set up your business number</a
			>
		</div>
	</div>
{/if}
