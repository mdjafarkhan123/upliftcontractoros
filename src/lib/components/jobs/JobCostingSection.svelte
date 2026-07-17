<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { formatCurrency, formatDate } from '$lib/utils/format';
	import { toast } from '$lib/stores/toast.svelte';
	import { jobDetailStore } from '$lib/stores/jobDetail.svelte';
	import type { JobCosting, JobExpenseCategory, JobExpenseRow } from '$lib/types/jobs';
	import { Button } from '$lib/components/ui/button';

	let {
		jobId,
		expenses,
		costing,
		canManage
	}: {
		jobId: string;
		expenses: JobExpenseRow[];
		costing: JobCosting;
		// Whether this viewer can add/edit/delete expenses (edit access to the job). Cost
		// visibility is already implied — this whole section only renders for revenue members.
		canManage: boolean;
	} = $props();

	const CATEGORIES: { value: JobExpenseCategory; label: string; icon: string }[] = [
		{ value: 'materials', label: 'Materials', icon: 'ri-hammer-line' },
		{ value: 'labor', label: 'Labor', icon: 'ri-time-line' },
		{ value: 'subcontractor', label: 'Subcontractor', icon: 'ri-team-line' },
		{ value: 'equipment', label: 'Equipment', icon: 'ri-tools-line' },
		{ value: 'other', label: 'Other', icon: 'ri-price-tag-3-line' }
	];
	function cat(value: string) {
		return CATEGORIES.find((c) => c.value === value) ?? CATEGORIES[4];
	}

	const profitNum = $derived(Number(costing.profit));
	const isLoss = $derived(profitNum < 0);

	// Cost-vs-profit split of revenue, for the horizontal bar. A job that costs more than it
	// earns pins the cost portion at 100% (a full red bar reads as "underwater" at a glance).
	const costPct = $derived.by(() => {
		const rev = Number(costing.revenue);
		const cost = Number(costing.cost_total);
		if (rev > 0) return Math.min(100, (cost / rev) * 100);
		return cost > 0 ? 100 : 0;
	});
	const profitPct = $derived(Math.max(0, 100 - costPct));

	const hasExpenses = $derived(expenses.length > 0);

	// ── Inline add/edit form ─────────────────────────────────────────────────────
	function today(): string {
		return new Date().toISOString().slice(0, 10);
	}

	let formOpen = $state(false);
	let editingId = $state<string | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	// Kept as a plain string because the Select wrapper binds `string | undefined`; the server
	// re-validates it against the category enum, and cat() coerces for display.
	let fCategory = $state<string>('materials');
	let fDescription = $state('');
	let fAmount = $state('');
	let fDate = $state(today());
	let fNotes = $state('');

	function openAdd() {
		editingId = null;
		fCategory = 'materials';
		fDescription = '';
		fAmount = '';
		fDate = today();
		fNotes = '';
		formError = null;
		formOpen = true;
	}

	function openEdit(e: JobExpenseRow) {
		editingId = e.id;
		fCategory = e.category;
		fDescription = e.description;
		fAmount = e.amount;
		fDate = e.expense_date;
		fNotes = e.notes ?? '';
		formError = null;
		formOpen = true;
	}

	function closeForm() {
		formOpen = false;
		editingId = null;
		formError = null;
	}

	function applyResult(data: { expenses: JobExpenseRow[]; costing: JobCosting }) {
		jobDetailStore.patch(jobId, (prev) => ({
			...prev,
			expenses: data.expenses,
			costing: data.costing
		}));
	}

	async function save() {
		const amount = Number(fAmount);
		if (!fDescription.trim()) {
			formError = 'Enter a description.';
			return;
		}
		if (!(amount > 0)) {
			formError = 'Enter an amount greater than 0.';
			return;
		}
		saving = true;
		formError = null;
		try {
			const url = editingId
				? `/api/jobs/${jobId}/expenses/${editingId}`
				: `/api/jobs/${jobId}/expenses`;
			const res = await fetch(url, {
				method: editingId ? 'PATCH' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					category: fCategory,
					description: fDescription.trim(),
					amount,
					expense_date: fDate,
					notes: fNotes.trim() || null
				})
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				formError = body.error ?? 'Could not save expense.';
				return;
			}
			applyResult(body.data);
			toast.success(editingId ? 'Expense updated' : 'Expense added');
			closeForm();
		} catch {
			formError = 'Network error. Try again.';
		} finally {
			saving = false;
		}
	}

	let deletingId = $state<string | null>(null);
	async function remove(e: JobExpenseRow) {
		if (!confirm(`Delete "${e.description}"? This can't be undone from here.`)) return;
		deletingId = e.id;
		try {
			const res = await fetch(`/api/jobs/${jobId}/expenses/${e.id}`, { method: 'DELETE' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not delete expense.');
				return;
			}
			applyResult(body.data);
			toast.success('Expense deleted');
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			deletingId = null;
		}
	}
</script>

<section class="job-section job-costing">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="ri-line-chart-line job-section__icon" aria-hidden="true"></i>
			<h2 class="job-section__title">Job costing</h2>
		</div>
		<span class="job-costing__private">
			<i class="ri-lock-line" aria-hidden="true"></i>
			Internal only
		</span>
	</div>

	<!-- Revenue / Costs / Profit -->
	<div class="job-costing__summary">
		<div class="job-costing__stat">
			<span class="job-costing__stat-label">Revenue</span>
			<span class="job-costing__stat-value">{formatCurrency(costing.revenue)}</span>
		</div>
		<div class="job-costing__stat">
			<span class="job-costing__stat-label">Costs</span>
			<span class="job-costing__stat-value job-costing__stat-value--cost">
				{formatCurrency(costing.cost_total)}
			</span>
		</div>
		<div class="job-costing__stat job-costing__stat--profit">
			<span class="job-costing__stat-label">Profit</span>
			<span
				class="job-costing__stat-value"
				class:job-costing__stat-value--loss={isLoss}
				class:job-costing__stat-value--gain={!isLoss}
			>
				{formatCurrency(costing.profit)}
			</span>
			{#if costing.margin_pct !== null}
				<span class="job-costing__margin" class:job-costing__margin--loss={isLoss}>
					{costing.margin_pct}% margin
				</span>
			{/if}
		</div>
	</div>

	<!-- Cost vs profit bar -->
	<div class="job-costing__bar" role="presentation">
		<div class="job-costing__bar-fill job-costing__bar-fill--cost" style="width:{costPct}%"></div>
		<div
			class="job-costing__bar-fill job-costing__bar-fill--profit"
			style="width:{profitPct}%"
		></div>
	</div>

	<!-- Breakdown -->
	<dl class="job-costing__breakdown">
		<div class="job-costing__breakdown-row">
			<dt>Line item cost</dt>
			<dd>{formatCurrency(costing.line_item_cost)}</dd>
		</div>
		<div class="job-costing__breakdown-row">
			<dt>Expenses</dt>
			<dd>{formatCurrency(costing.expense_total)}</dd>
		</div>
		<div class="job-costing__breakdown-row job-costing__breakdown-row--total">
			<dt>Total cost</dt>
			<dd>{formatCurrency(costing.cost_total)}</dd>
		</div>
	</dl>

	<!-- Expenses -->
	<div class="job-costing__expenses">
		<div class="job-costing__expenses-head">
			<span class="job-costing__expenses-title">Expenses</span>
			{#if canManage && !formOpen}
				<Button variant="secondary" size="sm" onclick={openAdd}>
					<i class="ri-add-line" aria-hidden="true"></i>
					Add expense
				</Button>
			{/if}
		</div>

		{#if !hasExpenses && !formOpen}
			<p class="job-costing__expenses-empty">
				No expenses logged yet. Add materials, subcontractor, or equipment costs to see true profit.
			</p>
		{/if}

		{#each expenses as e (e.id)}
			<div class="job-costing__expense" class:job-costing__expense--editing={editingId === e.id}>
				<i class="{cat(e.category).icon} job-costing__expense-icon" aria-hidden="true"></i>
				<div class="job-costing__expense-main">
					<p class="job-costing__expense-desc">{e.description}</p>
					<p class="job-costing__expense-meta">
						{cat(e.category).label} · {formatDate(e.expense_date)}{e.created_by_name
							? ` · ${e.created_by_name}`
							: ''}
					</p>
					{#if e.notes}
						<p class="job-costing__expense-notes">{e.notes}</p>
					{/if}
				</div>
				<span class="job-costing__expense-amount">{formatCurrency(e.amount)}</span>
				{#if canManage}
					<div class="job-costing__expense-actions">
						<button
							type="button"
							class="job-costing__icon-btn"
							aria-label="Edit expense"
							onclick={() => openEdit(e)}
						>
							<i class="ri-pencil-line" aria-hidden="true"></i>
						</button>
						<button
							type="button"
							class="job-costing__icon-btn job-costing__icon-btn--danger"
							aria-label="Delete expense"
							disabled={deletingId === e.id}
							onclick={() => remove(e)}
						>
							{#if deletingId === e.id}
								<i class="ri-loader-4-line job-section__spin" aria-hidden="true"></i>
							{:else}
								<i class="ri-delete-bin-line" aria-hidden="true"></i>
							{/if}
						</button>
					</div>
				{/if}
			</div>
		{/each}

		<!-- Inline add / edit form -->
		{#if formOpen}
			<div class="job-costing__form">
				<div class="job-costing__form-grid">
					<div class="field job-costing__form-field">
						<label class="field__label" for="exp-category">Category</label>
						<Select.Root bind:value={fCategory}>
							<Select.Trigger id="exp-category">
								{cat(fCategory).label}
							</Select.Trigger>
							<Select.Content>
								{#each CATEGORIES as c (c.value)}
									<Select.Item value={c.value} label={c.label}>{c.label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="field job-costing__form-field">
						<label class="field__label" for="exp-amount">Amount</label>
						<Input
							id="exp-amount"
							type="number"
							min="0"
							step="0.01"
							bind:value={fAmount}
							placeholder="0.00"
						/>
					</div>
					<div class="field job-costing__form-field">
						<label class="field__label" for="exp-date">Date</label>
						<Input id="exp-date" type="date" bind:value={fDate} />
					</div>
				</div>
				<div class="field">
					<label class="field__label" for="exp-desc">Description</label>
					<Input
						id="exp-desc"
						bind:value={fDescription}
						placeholder="e.g. Lumber from Home Depot"
					/>
				</div>
				<div class="field">
					<label class="field__label" for="exp-notes">Notes (optional)</label>
					<textarea
						id="exp-notes"
						class="job-costing__textarea"
						bind:value={fNotes}
						rows="2"
						placeholder="Receipt #, vendor, or any detail"
					></textarea>
				</div>

				{#if formError}
					<p class="job-costing__form-error" role="alert">{formError}</p>
				{/if}

				<div class="job-costing__form-actions">
					<Button variant="ghost" size="sm" onclick={closeForm} disabled={saving}>Cancel</Button>
					<Button size="sm" loading={saving} onclick={save}>
						{editingId ? 'Save expense' : 'Add expense'}
					</Button>
				</div>
			</div>
		{/if}
	</div>
</section>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.job-costing {
		&__private {
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			font-size: $fs-body;
			color: var(--color-text-muted);

			i {
				font-size: 0.95rem;
			}
		}

		// ── Summary ──────────────────────────────────────────────────────────────
		&__summary {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: $space-3;
			margin-bottom: $space-4;
		}

		&__stat {
			display: flex;
			flex-direction: column;
			gap: $space-1;
			padding: $space-3 $space-4;
			border-radius: $radius-lg;
			background: var(--color-bg-surface-sunk);

			&--profit {
				background: var(--success-bg);
			}
		}

		&__stat-label {
			font-size: $fs-caption;
			font-weight: $weight-semibold;
			letter-spacing: $tracking-label;
			text-transform: uppercase;
			color: var(--color-text-muted);
		}

		&__stat-value {
			font: $weight-bold #{$fs-h3}/ 1.1 $font-display;
			color: var(--color-text-primary);

			&--cost {
				color: var(--color-text-secondary);
			}

			&--gain {
				color: var(--success-text);
			}

			&--loss {
				color: var(--danger-text);
			}
		}

		&__margin {
			margin-top: $space-1;
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--success-text);

			&--loss {
				color: var(--danger-text);
			}
		}

		// ── Cost/profit bar ────────────────────────────────────────────────────────
		&__bar {
			display: flex;
			height: 10px;
			border-radius: $radius-full;
			overflow: hidden;
			background: var(--color-bg-surface-sunk);
			margin-bottom: $space-4;
		}

		&__bar-fill {
			height: 100%;
			transition: width $duration-slow $ease-standard;

			&--cost {
				background: var(--warning-solid);
			}

			&--profit {
				background: var(--success-solid);
			}
		}

		// ── Breakdown ────────────────────────────────────────────────────────────
		&__breakdown {
			margin: 0 0 $space-4;
			padding: $space-3 $space-4;
			border: 1px solid var(--color-border);
			border-radius: $radius-lg;
		}

		&__breakdown-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			font-size: $fs-body;
			color: var(--color-text-secondary);

			& + & {
				margin-top: $space-2;
			}

			dt {
				color: var(--color-text-secondary);
			}

			dd {
				margin: 0;
				font-weight: $weight-medium;
				color: var(--color-text-primary);
			}

			&--total {
				margin-top: $space-3;
				padding-top: $space-3;
				border-top: 1px solid var(--color-border);

				dt {
					font-weight: $weight-semibold;
					color: var(--color-text-primary);
				}

				dd {
					font-weight: $weight-bold;
				}
			}
		}

		// ── Expenses ─────────────────────────────────────────────────────────────
		&__expenses-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: $space-2;
		}

		&__expenses-title {
			font-size: $fs-body;
			font-weight: $weight-semibold;
			letter-spacing: $tracking-label;
			text-transform: uppercase;
			color: var(--color-text-muted);
		}

		&__expenses-empty {
			font-size: $fs-body;
			color: var(--color-text-muted);
			font-style: italic;
		}

		&__expense {
			display: flex;
			align-items: center;
			gap: $space-3;
			padding: $space-3 0;
			border-bottom: 1px solid var(--color-border);

			&--editing {
				opacity: 0.5;
			}
		}

		&__expense-icon {
			flex-shrink: 0;
			width: 34px;
			height: 34px;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: $radius-full;
			background: var(--color-bg-surface-sunk);
			color: var(--color-text-secondary);
			font-size: 1.05rem;
		}

		&__expense-main {
			flex: 1;
			min-width: 0;
		}

		&__expense-desc {
			margin: 0;
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
		}

		&__expense-meta {
			margin: 2px 0 0;
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__expense-notes {
			margin: $space-1 0 0;
			font-size: $fs-body;
			color: var(--color-text-secondary);
		}

		&__expense-amount {
			flex-shrink: 0;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
		}

		&__expense-actions {
			display: flex;
			gap: $space-1;
			flex-shrink: 0;
		}

		&__icon-btn {
			width: 30px;
			height: 30px;
			display: flex;
			align-items: center;
			justify-content: center;
			border: none;
			border-radius: $radius-full;
			background: transparent;
			color: var(--color-text-muted);
			cursor: pointer;
			transition:
				background-color $duration-fast $ease-standard,
				color $duration-fast $ease-standard;

			&:hover {
				background: var(--color-bg-surface-sunk);
				color: var(--color-text-primary);
			}

			&--danger:hover {
				background: var(--danger-bg);
				color: var(--danger-text);
			}

			&:disabled {
				opacity: 0.5;
				cursor: not-allowed;
			}
		}

		// ── Inline form ────────────────────────────────────────────────────────────
		&__form {
			margin-top: $space-4;
			padding: $space-4;
			border: 1px solid var(--color-border-strong);
			border-radius: $radius-lg;
			background: var(--color-bg-surface-sunk);
			display: flex;
			flex-direction: column;
			gap: $space-3;
		}

		&__form-grid {
			display: grid;
			grid-template-columns: 1.2fr 1fr 1fr;
			gap: $space-3;
		}

		&__textarea {
			width: 100%;
			padding: $space-3 $space-4;
			border-radius: $radius-md;
			border: 1px solid var(--color-border-strong);
			background: var(--color-bg-surface);
			font: inherit;
			font-size: $fs-body;
			color: var(--color-text-primary);
			resize: vertical;

			&:focus {
				outline: none;
				border-color: var(--color-brand);
				box-shadow: var(--shadow-focus);
			}
		}

		&__form-error {
			margin: 0;
			font-size: $fs-body;
			font-weight: 600;
			color: var(--danger-text);
		}

		&__form-actions {
			display: flex;
			justify-content: flex-end;
			gap: $space-2;
		}
	}

	@media (max-width: 560px) {
		.job-costing__summary,
		.job-costing__form-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
