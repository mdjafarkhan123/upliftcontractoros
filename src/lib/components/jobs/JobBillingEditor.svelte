<script lang="ts" module>
	// A single editable milestone row. `key` is the server identity (null = new, not yet saved);
	// `locked` means it's already been turned into an invoice and must not be edited or removed.
	export type MilestoneDraft = {
		client_id: string;
		key: string | null;
		description: string;
		amount_value: string;
		due_date: string | null;
		locked: boolean;
	};
</script>

<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import { Calendar } from '$lib/components/ui/calendar';
	import RecurringScheduleModal from '$lib/components/jobs/RecurringScheduleModal.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import {
		milestoneAmount,
		BILLING_TYPE_DESC,
		BILLING_REPEAT_LABEL,
		type BillingType,
		type BillingRepeatMode
	} from '$lib/jobs/billing';
	import type { JobFormState } from '$lib/jobs/jobForm.svelte';
	import type { Snippet } from 'svelte';

	// The unified billing editor, laid out PER JOB TYPE to match Jobber exactly (ref/billing):
	//   • ONE-OFF (ref/billing/1) — just two checkboxes: a close-the-job invoice reminder, and an
	//     optional "split into a payment schedule" (progress invoicing). A one-off is always fixed
	//     price, so there are no billing-type/frequency selectors.
	//   • RECURRING (ref/billing/10-11) — a "Billing type" choice (Visit based / Fixed price) and an
	//     "Invoice frequency" schedule (Jobber's exact dropdown, incl. "Custom schedule…" → the
	//     recurrence modal). No split option.
	// All state lives on the shared JobFormState so both the New Job page and the detail edit surface
	// render the identical control. `hideHeader` drops the card chrome + "Billing" title when the
	// editor is hosted inside the "Edit invoice settings" modal (which supplies its own title).
	let {
		form,
		footer,
		hideHeader = false
	}: { form: JobFormState; footer?: Snippet; hideHeader?: boolean } = $props();

	// ── One-off payment schedule (split / progress invoicing) ─────────────────────
	// Live dollar value of one row given the global %/$ mode + the job total.
	function rowAmount(m: MilestoneDraft): number {
		return milestoneAmount(form.splitBy, Number(m.amount_value), form.total);
	}

	const allocated = $derived(form.billingMilestones.reduce((sum, m) => sum + rowAmount(m), 0));
	const remainingToAllocate = $derived(Math.round((form.total - allocated) * 100) / 100);

	// Hard-clamp (debounced): after the contractor stops typing for ~1s, if the schedule now bills
	// more than the job total, trim the row they just edited back down so the total fits.
	let clampTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleClamp(clientId: string) {
		if (clampTimer) clearTimeout(clampTimer);
		clampTimer = setTimeout(() => clampRow(clientId), 1000);
	}

	function clampRow(clientId: string) {
		clampTimer = null;
		if (form.total <= 0) return;
		const over = Math.round((allocated - form.total) * 100) / 100;
		if (over <= 0.01) return;
		const idx = form.billingMilestones.findIndex((m) => m.client_id === clientId);
		if (idx === -1 || form.billingMilestones[idx].locked) return;
		const current = Number(form.billingMilestones[idx].amount_value) || 0;
		const reduceBy = form.splitBy === 'fixed' ? over : (over / form.total) * 100;
		const next = Math.max(0, Math.round((current - reduceBy) * 100) / 100);
		form.billingMilestones[idx].amount_value = next ? String(next) : '';
	}

	$effect(() => () => {
		if (clampTimer) clearTimeout(clampTimer);
	});

	// The close-the-job invoice reminder (one-off): checked = invoice on completion, unchecked =
	// never prompt. A one-off is always fixed price, so this is the whole "when to invoice" choice.
	function onToggleReminder(checked: boolean) {
		form.billingFrequency = checked ? 'on_completion' : 'never';
	}

	function onToggleSplit(checked: boolean) {
		form.splitEnabled = checked;
		if (checked && form.billingMilestones.length === 0) addMilestone();
	}

	function addMilestone() {
		form.billingMilestones = [
			...form.billingMilestones,
			{
				client_id: crypto.randomUUID(),
				key: null,
				description: `Payment ${form.billingMilestones.length + 1}`,
				amount_value: '',
				due_date: null,
				locked: false
			}
		];
	}

	function removeMilestone(clientId: string) {
		form.billingMilestones = form.billingMilestones.filter((m) => m.client_id !== clientId);
	}

	// ── Recurring billing type (Jobber "Billing type" radios) ─────────────────────
	// Switching to Fixed price drops the visit-only "After each visit is completed" frequency (it's
	// hidden for fixed, ref/billing/15) — fall back to the canned monthly-last-day schedule.
	function setBillingType(t: BillingType) {
		form.billingType = t;
		if (t === 'fixed' && form.billingFrequency === 'per_visit') {
			form.setBillingRepeatMode('monthly_last');
		}
	}

	// ── Recurring "Invoice frequency" dropdown (Jobber) ───────────────────────────
	// Options are declared as data and handed to <Select.Root items> AND rendered from the same
	// array (Bits UI's documented shape) so the closed trigger resolves its label correctly — it
	// matters because `billingRepeatMode` is $derived and settles a tick after the dropdown closes.
	// "After each visit is completed" (per_visit) is hidden for Fixed price (ref/billing/15).
	const freqPresets = $derived([
		{ value: 'monthly_last', label: BILLING_REPEAT_LABEL.monthly_last },
		...(form.billingType === 'visit_based'
			? [{ value: 'per_visit', label: BILLING_REPEAT_LABEL.per_visit }]
			: []),
		{ value: 'never', label: BILLING_REPEAT_LABEL.never },
		{ value: 'on_completion', label: BILLING_REPEAT_LABEL.on_completion }
	]);
	// Split from the presets by the "Or" separator. A saved CUSTOM schedule is injected as its own
	// option so the trigger reads the rule ("Every 2 weeks on Mon") rather than the action row.
	const freqCustom = $derived([
		{ value: 'custom', label: BILLING_REPEAT_LABEL.custom },
		...(form.billingRepeatMode === 'custom_saved'
			? [{ value: 'custom_saved', label: form.invoiceRepeatLabel }]
			: [])
	]);
</script>

<div class="job-section" class:job-section--bare={hideHeader}>
	{#if !hideHeader}
		<div class="job-section__head">
			<div class="job-section__head-main">
				<i class="ri-bill-line job-section__icon" aria-hidden="true"></i>
				<h2 class="job-section__title">
					{form.jobMode === 'recurring' ? 'Billing & automatic payments' : 'Billing'}
				</h2>
			</div>
		</div>
	{/if}

	{#if form.jobMode === 'recurring'}
		<!-- RECURRING: billing type + invoice frequency (Jobber ref/billing/10-11). No split. -->
		<fieldset class="recur-billing__fieldset">
			<legend class="recur-billing__legend">Billing type</legend>

			<label
				class="recur-billing__radio"
				class:recur-billing__radio--active={form.billingType === 'visit_based'}
			>
				<input
					type="radio"
					name="billing-type"
					value="visit_based"
					checked={form.billingType === 'visit_based'}
					onchange={() => setBillingType('visit_based')}
				/>
				<span class="recur-billing__radio-body">
					<span class="recur-billing__radio-title">Visit based</span>
					<span class="recur-billing__radio-desc">{BILLING_TYPE_DESC.visit_based}</span>
				</span>
			</label>

			<label
				class="recur-billing__radio"
				class:recur-billing__radio--active={form.billingType === 'fixed'}
			>
				<input
					type="radio"
					name="billing-type"
					value="fixed"
					checked={form.billingType === 'fixed'}
					onchange={() => setBillingType('fixed')}
				/>
				<span class="recur-billing__radio-body">
					<span class="recur-billing__radio-title">Fixed price</span>
					<span class="recur-billing__radio-desc">{BILLING_TYPE_DESC.fixed}</span>
				</span>
			</label>
		</fieldset>

		<div class="field recur-billing__freq">
			<span class="field__label">Invoice frequency</span>
			<Select.Root
				value={form.billingRepeatMode}
				items={[...freqPresets, ...freqCustom]}
				onValueChange={(v) => form.setBillingRepeatMode(v as BillingRepeatMode)}
			>
				<Select.Trigger><Select.Value /></Select.Trigger>
				<Select.Content>
					{#each freqPresets as opt (opt.value)}
						<Select.Item value={opt.value} label={opt.label}>{opt.label}</Select.Item>
					{/each}
					<p class="repeat-or">Or</p>
					{#each freqCustom as opt (opt.value)}
						<Select.Item value={opt.value} label={opt.label}>{opt.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			{#if form.billingRepeatMode === 'custom_saved'}
				<p class="field__hint">{form.invoiceRepeatLabel}</p>
			{/if}
		</div>
	{:else}
		<!-- ONE-OFF: two checkboxes (Jobber ref/billing/1). Always fixed price. -->
		<label class="job-billing__check">
			<input
				type="checkbox"
				checked={form.billingFrequency === 'on_completion'}
				onchange={(e) => onToggleReminder((e.currentTarget as HTMLInputElement).checked)}
			/>
			<span>Remind me to invoice when I close the job</span>
		</label>

		<div class="job-section-divider"></div>

		<!-- Payment schedule (progress invoicing) — split the fixed price into installments. -->
		<div class="job-billing__split-head">
			<label class="job-billing__check">
				<input
					type="checkbox"
					checked={form.splitEnabled}
					onchange={(e) => onToggleSplit((e.currentTarget as HTMLInputElement).checked)}
				/>
				<span>Split into multiple invoices with a payment schedule</span>
			</label>
			{#if form.splitEnabled}
				<div class="job-billing__mode">
					<span class="job-billing__mode-label">Split payments by</span>
					<div class="job-billing__mode-toggle" role="group" aria-label="Split payments by">
						<button
							type="button"
							class="job-billing__mode-btn"
							class:job-billing__mode-btn--active={form.splitBy === 'percent'}
							aria-pressed={form.splitBy === 'percent'}
							onclick={() => (form.splitBy = 'percent')}
						>
							%
						</button>
						<button
							type="button"
							class="job-billing__mode-btn"
							class:job-billing__mode-btn--active={form.splitBy === 'fixed'}
							aria-pressed={form.splitBy === 'fixed'}
							onclick={() => (form.splitBy = 'fixed')}
						>
							$
						</button>
					</div>
				</div>
			{/if}
		</div>

		{#if form.splitEnabled}
			<div class="job-billing__alloc">
				<div class="job-billing__alloc-row">
					<span>Job total</span>
					<strong>{formatCurrency(form.total)}</strong>
				</div>
				<div class="job-billing__alloc-row">
					<span>Allocated to schedule</span>
					<strong>{formatCurrency(allocated)}</strong>
				</div>
				<div
					class="job-billing__alloc-row job-billing__alloc-row--remain"
					class:job-billing__alloc-row--over={remainingToAllocate < 0}
				>
					<span>{remainingToAllocate < 0 ? 'Over-allocated by' : 'Left to allocate'}</span>
					<strong>{formatCurrency(Math.abs(remainingToAllocate))}</strong>
				</div>
			</div>

			{#if remainingToAllocate < 0}
				<p class="job-billing__cap-error" role="alert">
					<i class="ri-error-warning-line" aria-hidden="true"></i>
					The payment schedule can't bill more than the job total. Lower an amount to continue.
				</p>
			{/if}

			<div class="job-billing__rows">
				{#each form.billingMilestones as m (m.client_id)}
					<div class="job-billing__row" class:job-billing__row--locked={m.locked}>
						<div class="job-billing__row-desc">
							<input
								class="field__input"
								bind:value={m.description}
								placeholder="Payment description"
								maxlength="120"
								disabled={m.locked}
							/>
						</div>
						<div class="job-billing__row-amount">
							<div class="job-billing__amount-field">
								{#if form.splitBy === 'fixed'}
									<span class="job-billing__affix" aria-hidden="true">$</span>
								{/if}
								<input
									class="field__input"
									type="number"
									inputmode="decimal"
									min="0"
									step="0.01"
									bind:value={m.amount_value}
									oninput={() => scheduleClamp(m.client_id)}
									placeholder="0"
									disabled={m.locked}
								/>
								{#if form.splitBy === 'percent'}
									<span class="job-billing__affix job-billing__affix--suffix" aria-hidden="true"
										>%</span
									>
								{/if}
							</div>
							{#if form.splitBy === 'percent'}
								<span class="job-billing__row-live">= {formatCurrency(rowAmount(m))}</span>
							{/if}
						</div>
						<div class="job-billing__row-due">
							<Calendar
								value={m.due_date ?? ''}
								onValueChange={(v) => (m.due_date = v || null)}
								placeholder="Due date"
								disabled={m.locked}
							/>
						</div>
						<div class="job-billing__row-action">
							{#if m.locked}
								<span class="job-billing__locked-tag">
									<i class="ri-lock-line" aria-hidden="true"></i> Invoiced
								</span>
							{:else}
								<button
									type="button"
									class="job-billing__del"
									onclick={() => removeMilestone(m.client_id)}
									aria-label="Remove payment"
								>
									<i class="ri-delete-bin-line" aria-hidden="true"></i>
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			<button type="button" class="job-billing__add" onclick={addMilestone}>
				<i class="ri-add-line" aria-hidden="true"></i>
				Add Invoice to Payment Schedule
			</button>
		{/if}
	{/if}
	{@render footer?.()}
</div>

<!-- The "Custom schedule…" invoice recurrence modal — reuses the SAME builder as the visit rule.
     Separate open state (invoiceRecurModalOpen) so it never clashes with the visit modal. -->
<RecurringScheduleModal
	bind:open={form.invoiceRecurModalOpen}
	value={form.invoiceRecurShape}
	onsave={form.onInvoiceRecurSaved}
/>
