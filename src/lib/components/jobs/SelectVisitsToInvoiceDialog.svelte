<script lang="ts">
	import { goto } from '$app/navigation';
	import { SvelteSet } from 'svelte/reactivity';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import Badge from '$lib/components/shared/Badge.svelte';
	import { formatCurrency, formatDate } from '$lib/utils/format';
	import { toast } from '$lib/stores/toast.svelte';

	// The "Select visits to invoice" picker (Jobber ref/billing/21). Opened from the recurring
	// Invoicing-tab "Create" row and from a reminder's Create-Invoice action. Lists the job header
	// plus its billable visits (uninvoiced on-or-before today + the single next upcoming); the
	// contractor ticks which to bill and Continue creates ONE draft invoice from them.

	type BillableVisit = {
		id: string;
		title: string;
		scheduled_start: string;
		status: 'overdue' | 'today' | 'upcoming';
		subtotal: string;
	};
	type JobHeader = {
		id: string;
		title: string;
		contact_name: string;
		address: string | null;
		status: 'late' | 'today' | 'upcoming' | null;
		subtotal: string;
		completed_visit_count: number;
	};

	let {
		open = $bindable(),
		jobId,
		onInvoiced
	}: {
		open: boolean;
		jobId: string;
		// Fired after the invoice is created (before navigation) so the parent can refresh its feed.
		onInvoiced?: (invoiceId: string) => void;
	} = $props();

	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let jobHeader = $state<JobHeader | null>(null);
	let visits = $state<BillableVisit[]>([]);
	// SvelteSet is reactive on in-place mutation (add/delete/clear) — no reassignment needed.
	const checked = new SvelteSet<string>();
	let submitting = $state(false);
	let hasLoaded = $state(false);

	// Load fresh each time the modal opens (the billable set shifts as visits complete / get billed);
	// reset when it closes so the next open starts clean.
	$effect(() => {
		if (open && !hasLoaded) {
			hasLoaded = true;
			void load();
		} else if (!open && hasLoaded) {
			hasLoaded = false;
			jobHeader = null;
			visits = [];
			checked.clear();
			loadError = null;
		}
	});

	async function load() {
		loading = true;
		loadError = null;
		try {
			const res = await fetch(`/api/jobs/${jobId}/billable-visits`);
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				loadError = body.error ?? 'Could not load visits.';
				return;
			}
			const d = body.data as { job: JobHeader; visits: BillableVisit[] };
			jobHeader = d.job;
			visits = d.visits;
			// Everything is checked by default (Jobber ref/billing/21).
			checked.clear();
			for (const v of d.visits) checked.add(v.id);
		} catch {
			loadError = 'Network error. Please try again.';
		} finally {
			loading = false;
		}
	}

	const allChecked = $derived(visits.length > 0 && checked.size === visits.length);
	const selectedSubtotal = $derived(
		visits.reduce((sum, v) => (checked.has(v.id) ? sum + Number(v.subtotal) : sum), 0)
	);

	function toggleAll() {
		if (allChecked) checked.clear();
		else for (const v of visits) checked.add(v.id);
	}
	function toggleVisit(id: string) {
		if (checked.has(id)) checked.delete(id);
		else checked.add(id);
	}

	function visitVariant(s: BillableVisit['status']): 'danger' | 'warning' | 'info' {
		return s === 'overdue' ? 'danger' : s === 'today' ? 'warning' : 'info';
	}
	function visitLabel(s: BillableVisit['status']): string {
		return s === 'overdue' ? 'Overdue' : s === 'today' ? 'Today' : 'Upcoming';
	}
	const jobVariant = $derived(
		jobHeader?.status === 'late' ? 'danger' : jobHeader?.status === 'today' ? 'warning' : 'info'
	);
	const jobLabel = $derived(
		jobHeader?.status === 'late' ? 'Late' : jobHeader?.status === 'today' ? 'Today' : 'Upcoming'
	);

	async function submit() {
		if (checked.size === 0 || submitting) return;
		submitting = true;
		try {
			const res = await fetch(`/api/jobs/${jobId}/generate-invoice`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ visit_ids: [...checked] })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not create the invoice.');
				return;
			}
			const inv = body.data as { id: string; invoice_number_display: string };
			toast.success(`Invoice ${inv.invoice_number_display} created`);
			open = false;
			onInvoiced?.(inv.id);
			await goto(`/invoices/${inv.id}`);
		} catch {
			toast.error('Network error. Please try again.');
		} finally {
			submitting = false;
		}
	}

	function onOpenChange(next: boolean) {
		if (!next && !submitting) open = false;
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="select-visits" showClose={false}>
		<div class="select-visits__head">
			<h2 class="select-visits__title">
				Select visits to invoice{jobHeader ? ` for ${jobHeader.contact_name}` : ''}
			</h2>
			<Dialog.Close class="dialog-content__close" aria-label="Close">
				<i class="ri-close-line" aria-hidden="true"></i>
			</Dialog.Close>
		</div>

		{#if loading}
			<div class="select-visits__state">Loading visits…</div>
		{:else if loadError}
			<div class="select-visits__state select-visits__state--error" role="alert">{loadError}</div>
		{:else if visits.length === 0}
			<div class="select-visits__state">No visits are ready to invoice yet.</div>
		{:else}
			<div class="select-visits__table">
				<div class="select-visits__row select-visits__row--head">
					<span class="select-visits__col-check"></span>
					<span>Status</span>
					<span>Title</span>
					<span>Address</span>
					<span class="select-visits__col-num">Uninvoiced</span>
					<span class="select-visits__col-num">Subtotal</span>
				</div>

				<!-- Job header row: its checkbox selects / clears all visits. -->
				{#if jobHeader}
					<div class="select-visits__row select-visits__row--job">
						<span class="select-visits__col-check">
							<input
								type="checkbox"
								class="select-visits__check"
								checked={allChecked}
								onchange={toggleAll}
								aria-label="Select all visits"
							/>
						</span>
						<span><Badge variant={jobVariant} label={jobLabel} /></span>
						<a class="select-visits__job-link" href="/jobs/{jobHeader.id}">{jobHeader.title}</a>
						<span class="select-visits__muted">{jobHeader.address ?? '—'}</span>
						<span class="select-visits__col-num select-visits__muted">
							{jobHeader.completed_visit_count} visits completed
						</span>
						<span class="select-visits__col-num select-visits__amount">
							{formatCurrency(Number(jobHeader.subtotal))}
						</span>
					</div>
				{/if}

				{#each visits as v (v.id)}
					<div class="select-visits__row">
						<span class="select-visits__col-check">
							<input
								type="checkbox"
								class="select-visits__check"
								checked={checked.has(v.id)}
								onchange={() => toggleVisit(v.id)}
								aria-label="Select visit {formatDate(v.scheduled_start)}"
							/>
						</span>
						<span><Badge variant={visitVariant(v.status)} label={visitLabel(v.status)} /></span>
						<span class="select-visits__visit-title">Visit: {formatDate(v.scheduled_start)}</span>
						<span></span>
						<span class="select-visits__col-num"></span>
						<span class="select-visits__col-num select-visits__amount">
							{formatCurrency(Number(v.subtotal))}
						</span>
					</div>
				{/each}
			</div>
		{/if}

		<div class="select-visits__foot">
			{#if visits.length > 0}
				<span class="select-visits__subtotal">
					Subtotal: <strong>{formatCurrency(selectedSubtotal)}</strong>
				</span>
			{/if}
			<div class="select-visits__foot-actions">
				<Button variant="outline" onclick={() => (open = false)} disabled={submitting}
					>Cancel</Button
				>
				<Button
					loading={submitting}
					loadingLabel="Creating…"
					disabled={checked.size === 0}
					onclick={submit}
				>
					Continue
				</Button>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	:global(.dialog-content.select-visits) {
		max-width: 780px;
		padding: $space-5;
	}

	.select-visits {
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

		&__state {
			padding: $space-6 $space-3;
			text-align: center;
			color: var(--color-text-secondary);
			font-size: $fs-body;

			&--error {
				color: var(--danger-text);
			}
		}

		&__table {
			display: flex;
			flex-direction: column;
			border: 1px solid var(--color-border);
			border-radius: $radius-md;
			overflow: hidden;
		}

		&__row {
			display: grid;
			grid-template-columns: 44px 110px 1.4fr 1.6fr auto auto;
			align-items: center;
			gap: $space-3;
			padding: $space-3 $space-4;
			border-bottom: 1px solid var(--color-border);
			font-size: $fs-body;
			color: var(--color-text-primary);

			&:last-child {
				border-bottom: none;
			}

			&--head {
				background: var(--color-surface-2, var(--color-bg-subtle));
				font-size: $fs-caption;
				font-weight: $weight-semibold;
				color: var(--color-text-secondary);
				text-transform: uppercase;
				letter-spacing: 0.02em;
			}

			&--job {
				background: var(--color-bg-subtle);
				font-weight: $weight-medium;
			}
		}

		&__col-check {
			display: flex;
			align-items: center;
			justify-content: center;
		}

		&__col-num {
			text-align: right;
			justify-self: end;
			font-variant-numeric: tabular-nums;
		}

		&__check {
			width: 18px;
			height: 18px;
			accent-color: var(--color-brand);
			cursor: pointer;
		}

		&__job-link {
			font-weight: $weight-semibold;
			color: var(--color-brand);
			text-decoration: underline;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;

			&:hover {
				color: var(--color-brand-strong, var(--color-brand));
			}
		}

		&__visit-title {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		&__muted {
			color: var(--color-text-secondary);
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		&__amount {
			font-weight: $weight-semibold;
		}

		&__foot {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-4;
			margin-top: $space-5;
		}

		&__subtotal {
			font-size: $fs-body;
			color: var(--color-text-secondary);
			font-variant-numeric: tabular-nums;

			strong {
				color: var(--color-text-primary);
			}
		}

		&__foot-actions {
			display: flex;
			gap: $space-2;
			margin-left: auto;
		}
	}
</style>
