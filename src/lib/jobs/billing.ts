// Client-side helpers for one-off job billing (payment schedule). Pure math + status
// derivation shared by the Billing editor (jobs/new + detail edit) and the read-only
// Billing card (job detail view). No date math, no fetching.
import type { JobBillingBadge, JobBillingSignals, JobPaymentMilestoneRow, JobStatus } from '$lib/types/jobs';

export type MilestoneStatus = 'upcoming' | 'draft' | 'awaiting' | 'paid' | 'cancelled';

// The dollar value a milestone bills: a percentage share of the live job total, or a flat
// amount. Rounded to cents. (Same formula the server uses when creating the invoice.)
export function milestoneAmount(
	amountType: 'percent' | 'fixed',
	amountValue: number,
	jobTotal: number
): number {
	if (!Number.isFinite(amountValue) || amountValue <= 0) return 0;
	if (amountType === 'percent') return Math.round(jobTotal * amountValue) / 100;
	return Math.round(amountValue * 100) / 100;
}

// Per-row status, derived from the linked invoice (none = still upcoming).
export function milestoneStatus(m: JobPaymentMilestoneRow): MilestoneStatus {
	if (!m.invoice_id || !m.invoice_status) return 'upcoming';
	switch (m.invoice_status) {
		case 'paid':
			return 'paid';
		case 'cancelled':
			return 'cancelled';
		case 'draft':
			return 'draft';
		default:
			// sent / partially_paid / overdue → awaiting payment
			return 'awaiting';
	}
}

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
	upcoming: 'Upcoming',
	draft: 'Draft',
	awaiting: 'Awaiting Payment',
	paid: 'Paid',
	cancelled: 'Cancelled'
};

export type BillingProgress = { paid: number; awaiting: number; draft: number; remaining: number };

// Payment-progress buckets across the schedule, denominated against the job total.
// Un-invoiced (and cancelled) milestones fall into `remaining`.
export function billingProgress(
	milestones: JobPaymentMilestoneRow[],
	jobTotal: number
): BillingProgress {
	let paid = 0;
	let awaiting = 0;
	let draft = 0;
	for (const m of milestones) {
		const st = milestoneStatus(m);
		const invTotal = Number(m.invoice_total ?? 0);
		const invPaid = Number(m.invoice_amount_paid ?? 0);
		if (st === 'paid') {
			paid += invTotal;
		} else if (st === 'draft') {
			draft += invTotal;
		} else if (st === 'awaiting') {
			paid += invPaid;
			awaiting += Math.max(0, invTotal - invPaid);
		}
	}
	const remaining = Math.max(0, Math.round((jobTotal - paid - awaiting - draft) * 100) / 100);
	return {
		paid: Math.round(paid * 100) / 100,
		awaiting: Math.round(awaiting * 100) / 100,
		draft: Math.round(draft * 100) / 100,
		remaining
	};
}

// Percent of the job total a dollar figure represents (guards a zero total).
export function pctOf(amount: number, jobTotal: number): number {
	if (jobTotal <= 0) return 0;
	return Math.round((amount / jobTotal) * 1000) / 10;
}

// ── Jobs-list billing badge (BILLING.md) ─────────────────────────────────────
// At most ONE badge per job row, showing the single most important next money action.
// Priority (highest first): Overdue → Needs Invoice → Awaiting Payment → Paid. Cancelled jobs
// and jobs with no billing action yet return null (no badge). Purely derives from the flat
// signals the list query computes per row — no fetching, no date math (overdue is decided
// server-side against CURRENT_DATE).
export function deriveJobBillingBadge(
	status: JobStatus,
	s: JobBillingSignals | undefined
): JobBillingBadge | null {
	if (status === 'cancelled' || !s) return null;
	if (s.has_overdue) return 'overdue';
	if (s.needs_invoice) return 'needs_invoice';
	if (s.has_unpaid_sent) return 'awaiting_payment';
	if (s.all_settled) return 'paid';
	return null;
}

export const JOB_BILLING_BADGE_LABEL: Record<JobBillingBadge, string> = {
	overdue: 'Overdue',
	needs_invoice: 'Needs Invoice',
	awaiting_payment: 'Awaiting Payment',
	paid: 'Paid'
};

// Maps to the shared Badge variants (default | success | warning | danger | info).
export const JOB_BILLING_BADGE_VARIANT: Record<
	JobBillingBadge,
	'success' | 'warning' | 'danger' | 'info'
> = {
	overdue: 'danger',
	needs_invoice: 'warning',
	awaiting_payment: 'info',
	paid: 'success'
};

// ── Recurring billing (S4) ──────────────────────────────────────────────────
// Manual v1: the contractor chooses how a recurring job is billed, then presses
// "Generate invoice" each period. Nothing auto-fires (that layer is deferred).
export type BillingType = 'visit_based' | 'fixed';
export type InvoiceFrequency = 'per_visit' | 'weekly' | 'biweekly' | 'monthly';

export const BILLING_TYPE_LABEL: Record<BillingType, string> = {
	visit_based: 'Visit based',
	fixed: 'Fixed price'
};

// Short, human cadence labels for the "Invoice frequency" dropdown + detail view.
export const INVOICE_FREQUENCY_LABEL: Record<InvoiceFrequency, string> = {
	per_visit: 'Per visit',
	weekly: 'Weekly',
	biweekly: 'Every 2 weeks',
	monthly: 'Monthly'
};
