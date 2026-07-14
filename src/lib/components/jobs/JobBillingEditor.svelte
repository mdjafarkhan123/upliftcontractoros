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
	import { formatCurrency } from '$lib/utils/format';
	import { milestoneAmount } from '$lib/jobs/billing';
	import type { Snippet } from 'svelte';

	let {
		invoiceOnClose = $bindable(),
		splitEnabled = $bindable(),
		splitBy = $bindable(),
		milestones = $bindable(),
		total,
		footer
	}: {
		invoiceOnClose: boolean;
		splitEnabled: boolean;
		splitBy: 'percent' | 'fixed';
		milestones: MilestoneDraft[];
		total: number;
		footer?: Snippet;
	} = $props();

	// Live dollar value of one row given the global %/$ mode + the job total.
	function rowAmount(m: MilestoneDraft): number {
		return milestoneAmount(splitBy, Number(m.amount_value), total);
	}

	const allocated = $derived(milestones.reduce((sum, m) => sum + rowAmount(m), 0));
	const remainingToAllocate = $derived(Math.round((total - allocated) * 100) / 100);

	// Hard-clamp (debounced): after the contractor stops typing for ~1s, if the schedule now
	// bills more than the job total, trim the row they just edited back down so the total fits.
	// The delay lets them finish typing a number before we touch it. Save-time block + the
	// server reject are the other two layers that backstop this convenience.
	let clampTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleClamp(clientId: string) {
		if (clampTimer) clearTimeout(clampTimer);
		clampTimer = setTimeout(() => clampRow(clientId), 1000);
	}

	function clampRow(clientId: string) {
		clampTimer = null;
		if (total <= 0) return;
		const over = Math.round((allocated - total) * 100) / 100;
		if (over <= 0.01) return;
		const idx = milestones.findIndex((m) => m.client_id === clientId);
		if (idx === -1 || milestones[idx].locked) return;
		const current = Number(milestones[idx].amount_value) || 0;
		// Reduce by the overflow — in $ mode that's dollars, in % mode convert it to a percentage.
		const reduceBy = splitBy === 'fixed' ? over : (over / total) * 100;
		const next = Math.max(0, Math.round((current - reduceBy) * 100) / 100);
		milestones[idx].amount_value = next ? String(next) : '';
	}

	$effect(() => () => {
		if (clampTimer) clearTimeout(clampTimer);
	});

	function onToggleSplit(checked: boolean) {
		splitEnabled = checked;
		// Seed a first row so the schedule isn't an empty table the moment it's turned on.
		if (checked && milestones.length === 0) addMilestone();
	}

	function addMilestone() {
		milestones = [
			...milestones,
			{
				client_id: crypto.randomUUID(),
				key: null,
				description: `Payment ${milestones.length + 1}`,
				amount_value: '',
				due_date: null,
				locked: false
			}
		];
	}

	function removeMilestone(clientId: string) {
		milestones = milestones.filter((m) => m.client_id !== clientId);
	}
</script>

<div class="job-section">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="ri-bill-line job-section__icon" aria-hidden="true"></i>
			<h2 class="job-section__title">Billing</h2>
		</div>
	</div>

	<!-- Close reminder -->
	<label class="job-billing__check">
		<input type="checkbox" bind:checked={invoiceOnClose} />
		<span>Remind me to invoice when I close the job</span>
	</label>

	<div class="job-section-divider"></div>

	<!-- Payment schedule toggle + %/$ mode -->
	<div class="job-billing__split-head">
		<label class="job-billing__check">
			<input
				type="checkbox"
				checked={splitEnabled}
				onchange={(e) => onToggleSplit((e.currentTarget as HTMLInputElement).checked)}
			/>
			<span>Split into multiple invoices with a payment schedule</span>
		</label>
		{#if splitEnabled}
			<div class="job-billing__mode">
				<span class="job-billing__mode-label">Split payments by</span>
				<div class="job-billing__mode-toggle" role="group" aria-label="Split payments by">
					<button
						type="button"
						class="job-billing__mode-btn"
						class:job-billing__mode-btn--active={splitBy === 'percent'}
						aria-pressed={splitBy === 'percent'}
						onclick={() => (splitBy = 'percent')}
					>
						%
					</button>
					<button
						type="button"
						class="job-billing__mode-btn"
						class:job-billing__mode-btn--active={splitBy === 'fixed'}
						aria-pressed={splitBy === 'fixed'}
						onclick={() => (splitBy = 'fixed')}
					>
						$
					</button>
				</div>
			</div>
		{/if}
	</div>

	{#if splitEnabled}
		<!-- Allocation helper: how much of the job total is covered by the schedule so far. -->
		<div class="job-billing__alloc">
			<div class="job-billing__alloc-row">
				<span>Job total</span>
				<strong>{formatCurrency(total)}</strong>
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
			{#each milestones as m (m.client_id)}
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
							{#if splitBy === 'fixed'}
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
							{#if splitBy === 'percent'}
								<span class="job-billing__affix job-billing__affix--suffix" aria-hidden="true"
									>%</span
								>
							{/if}
						</div>
						{#if splitBy === 'percent'}
							<span class="job-billing__row-live">= {formatCurrency(rowAmount(m))}</span>
						{/if}
					</div>
					<div class="job-billing__row-due">
						<input
							class="field__input"
							type="date"
							value={m.due_date ?? ''}
							onchange={(e) => (m.due_date = (e.currentTarget as HTMLInputElement).value || null)}
							disabled={m.locked}
							aria-label="Due date"
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
	{@render footer?.()}
</div>
