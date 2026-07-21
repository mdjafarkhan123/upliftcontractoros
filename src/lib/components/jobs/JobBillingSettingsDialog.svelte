<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import JobBillingEditor from '$lib/components/jobs/JobBillingEditor.svelte';
	import type { JobFormState } from '$lib/jobs/jobForm.svelte';

	// The Jobber "Edit invoice settings" modal (ref/billing/6 one-off, /13 recurring). It hosts the
	// SAME per-kind billing editor used on the New Job page — the modal only supplies the title and the
	// Save/Cancel footer. Fully controlled by the parent detail page (open + save/cancel handlers), so
	// the existing saveBilling()/cancelBilling() flow is reused untouched.
	let {
		open,
		form,
		saving = false,
		error = null,
		onsave,
		oncancel
	}: {
		open: boolean;
		form: JobFormState;
		saving?: boolean;
		error?: string | null;
		onsave: () => void;
		oncancel: () => void;
	} = $props();

	// Closing via X / overlay / Esc funnels through the same cancel path so the form is reverted and
	// the modal never re-opens with stray unsaved edits. Idempotent, so a Save→close is harmless.
	function onOpenChange(next: boolean) {
		if (!next && !saving) oncancel();
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="job-billing-settings" showClose={false}>
		<div class="job-billing-settings__head">
			<h2 class="job-billing-settings__title">Edit invoice settings</h2>
			<Dialog.Close class="dialog-content__close" aria-label="Close">
				<i class="ri-close-line" aria-hidden="true"></i>
			</Dialog.Close>
		</div>

		<JobBillingEditor {form} hideHeader />

		{#if form.jobMode === 'recurring'}
			<!-- Auto-charge promo (Jobber ref/billing/13). Deferred — see recurring-billing-autocharge. -->
			<aside class="recur-billing__auto">
				<h3 class="recur-billing__auto-title">
					<i class="ri-bank-card-line" aria-hidden="true"></i> Get paid automatically
				</h3>
				<p class="recur-billing__auto-text">
					Clients are automatically invoiced and charged based on their billing frequency once they
					save a payment method on file.
				</p>
				<span class="recur-billing__auto-badge">Coming soon</span>
			</aside>
		{/if}

		{#if error}
			<p class="job-billing-settings__error" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				{error}
			</p>
		{/if}

		<div class="job-billing-settings__foot">
			<Button variant="outline" onclick={oncancel} disabled={saving}>Cancel</Button>
			<Button loading={saving} loadingLabel="Saving…" onclick={onsave}>Save</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	:global(.dialog-content.job-billing-settings) {
		max-width: 560px;
		padding: $space-5;
	}

	.job-billing-settings {
		&__head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: $space-4;
		}

		&__title {
			font-size: $fs-h3;
			font-weight: 700;
			color: var(--color-text-primary);
		}

		&__error {
			display: flex;
			align-items: flex-start;
			gap: $space-2;
			margin-top: $space-4;
			padding: $space-2 $space-3;
			border: 1px solid var(--danger-solid);
			border-radius: $radius-md;
			background: var(--danger-bg);
			color: var(--danger-text);
			font-size: $fs-body;
			font-weight: $weight-medium;
			i {
				flex-shrink: 0;
				font-size: 1.1rem;
				line-height: 1.4;
			}
		}

		&__foot {
			display: flex;
			justify-content: flex-end;
			gap: $space-2;
			margin-top: $space-5;
		}
	}
</style>
