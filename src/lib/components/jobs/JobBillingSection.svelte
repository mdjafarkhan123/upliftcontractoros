<script lang="ts">
	import { goto } from '$app/navigation';
	import { formatCurrency, formatDate } from '$lib/utils/format';
	import { toast } from '$lib/stores/toast.svelte';
	import {
		milestoneAmount,
		milestoneStatus,
		billingProgress,
		pctOf,
		MILESTONE_STATUS_LABEL
	} from '$lib/jobs/billing';
	import SectionEditButton from '$lib/components/shared/SectionEditButton.svelte';
	import type { JobDetail, JobPaymentMilestoneRow } from '$lib/types/jobs';
	import { Button } from '$lib/components/ui/button';

	let {
		job,
		canInvoice,
		onEdit
	}: {
		job: JobDetail;
		canInvoice: boolean;
		// When provided, a per-section "Edit" button opens the focused billing editor.
		onEdit?: () => void;
	} = $props();

	const total = $derived(Number(job.total));
	const milestones = $derived(job.payment_milestones);
	const hasSchedule = $derived(milestones.length > 0);

	const progress = $derived(billingProgress(milestones, total));

	// The four progress segments, in render order. Zero-width segments are skipped in the bar
	// but still listed in the legend (so the contractor sees "Paid 0%").
	const segments = $derived([
		{ key: 'paid', label: 'Paid', value: progress.paid, cls: 'paid' },
		{ key: 'awaiting', label: 'Awaiting Payment', value: progress.awaiting, cls: 'awaiting' },
		{ key: 'draft', label: 'Draft', value: progress.draft, cls: 'draft' },
		{ key: 'remaining', label: 'Remaining', value: progress.remaining, cls: 'remaining' }
	]);

	// Dollar figure + outstanding balance for a row (uses the live invoice once created).
	function rowTotal(m: JobPaymentMilestoneRow): number {
		if (m.invoice_id && m.invoice_total != null) return Number(m.invoice_total);
		return milestoneAmount(m.amount_type, Number(m.amount_value), total);
	}
	function rowBalance(m: JobPaymentMilestoneRow): number {
		if (m.invoice_id && m.invoice_total != null) {
			return Math.max(0, Number(m.invoice_total) - Number(m.invoice_amount_paid ?? 0));
		}
		return milestoneAmount(m.amount_type, Number(m.amount_value), total);
	}

	const scheduleTotal = $derived(milestones.reduce((s, m) => s + rowTotal(m), 0));
	const scheduleBalance = $derived(milestones.reduce((s, m) => s + rowBalance(m), 0));

	let creatingId = $state<string | null>(null);

	async function createInvoice(m: JobPaymentMilestoneRow) {
		creatingId = m.id;
		try {
			const res = await fetch(`/api/jobs/${job.id}/payment-schedule/${m.id}/invoice`, {
				method: 'POST'
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not create invoice.');
				return;
			}
			const d = body.data as {
				id: string;
				invoice_number_display: string;
				already_existed: boolean;
			};
			toast.success(
				d.already_existed
					? `Invoice ${d.invoice_number_display} already exists`
					: `Invoice ${d.invoice_number_display} created`
			);
			await goto(`/invoices/${d.id}`);
		} catch {
			toast.error('Network error. Please try again.');
		} finally {
			creatingId = null;
		}
	}
</script>

<section class="job-section">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="ri-bill-line job-section__icon" aria-hidden="true"></i>
			<h2 class="job-section__title">Billing</h2>
		</div>
		{#if onEdit}
			<SectionEditButton onclick={onEdit} />
		{/if}
	</div>

	{#if !job.invoice_on_close && !hasSchedule}
		<p class="job-section__empty">No billing set up. Add a deposit or payment schedule.</p>
	{:else}
		{#if job.invoice_on_close}
			<div class="job-billing__reminder">
				<i class="ri-notification-3-line" aria-hidden="true"></i>
				<span>You'll be reminded to invoice when this job is closed.</span>
			</div>
		{/if}

		{#if hasSchedule}
			<!-- Payment progress -->
			<div class="job-billing__progress">
				<p class="job-billing__progress-total">
					Total: <strong>{formatCurrency(total)}</strong>
				</p>
				<div class="job-billing__bar" role="presentation">
					{#each segments as seg (seg.key)}
						{#if seg.value > 0 && total > 0}
							<span
								class="job-billing__bar-seg job-billing__bar-seg--{seg.cls}"
								style="width: {pctOf(seg.value, total)}%"
							></span>
						{/if}
					{/each}
				</div>
				<div class="job-billing__legend">
					{#each segments as seg (seg.key)}
						<span class="job-billing__legend-item">
							<span class="job-billing__dot job-billing__dot--{seg.cls}" aria-hidden="true"></span>
							{seg.label}: {pctOf(seg.value, total)}% ({formatCurrency(seg.value)})
						</span>
					{/each}
				</div>
			</div>

			<!-- Milestone rows -->
			<div class="job-billing__table">
				{#each milestones as m (m.id)}
					{@const status = milestoneStatus(m)}
					<div class="job-billing__trow">
						<div class="job-billing__cell job-billing__cell--action">
							{#if m.invoice_id}
								<Button href="/invoices/{m.invoice_id}" variant="secondary" size="sm">View</Button>
							{:else if canInvoice}
								<Button size="sm" loading={creatingId === m.id} onclick={() => createInvoice(m)}>
									Create
								</Button>
							{:else}
								<span class="job-billing__muted">—</span>
							{/if}
						</div>
						<div class="job-billing__cell job-billing__cell--meta">
							<span class="job-billing__status job-billing__status--{status}">
								<span class="job-billing__dot job-billing__dot--{status}" aria-hidden="true"></span>
								{m.invoice_number != null ? `#${m.invoice_number} · ` : ''}{MILESTONE_STATUS_LABEL[
									status
								]}
							</span>
							<span class="job-billing__desc">{m.description}</span>
							<span class="job-billing__due">
								{m.due_date ? `Due ${formatDate(m.due_date)}` : 'No due date'}
							</span>
						</div>
						<div class="job-billing__cell job-billing__cell--amounts">
							<span class="job-billing__total">{formatCurrency(rowTotal(m))}</span>
							<span class="job-billing__balance">Bal {formatCurrency(rowBalance(m))}</span>
						</div>
					</div>
				{/each}
			</div>

			<div class="job-billing__foot">
				<span>Total</span>
				<span class="job-billing__foot-amounts">
					<span class="job-billing__total">{formatCurrency(scheduleTotal)}</span>
					<span class="job-billing__balance">Bal {formatCurrency(scheduleBalance)}</span>
				</span>
			</div>
		{/if}
	{/if}
</section>
