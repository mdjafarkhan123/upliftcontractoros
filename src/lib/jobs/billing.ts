// Client-side helpers for one-off job billing (payment schedule). Pure math + status
// derivation shared by the Billing editor (jobs/new + detail edit) and the read-only
// Billing card (job detail view). No date math, no fetching.
import type {
	JobBillingBadge,
	JobBillingSignals,
	JobPaymentMilestoneRow
} from '$lib/types/jobs';

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
		case 'bad_debt':
			return 'cancelled';
		case 'draft':
			return 'draft';
		default:
			// sent_not_due / awaiting_payment / past_due → awaiting payment
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
// Priority (highest first): Overdue → Needs Invoice → Draft (Send Invoice) → Awaiting Payment →
// Paid. `needs_invoice` means NO invoice exists yet (create one); `has_draft` means one exists but
// hasn't been sent (send it) — two genuinely different actions Jobber keeps distinct. Cancelled
// jobs and jobs with no billing action yet return null. Purely derives from the flat signals the
// list query computes per row — no fetching, no date math (overdue is decided server-side).
export function deriveJobBillingBadge(
	s: JobBillingSignals | undefined,
	// A cancelled job (archived + cancelled_at) shows no billing badge. Pass the job's cancelled_at.
	cancelledAt: string | null = null
): JobBillingBadge | null {
	if (cancelledAt || !s) return null;
	if (s.has_overdue) return 'overdue';
	if (s.needs_invoice) return 'needs_invoice';
	if (s.has_draft) return 'draft';
	if (s.has_unpaid_sent) return 'awaiting_payment';
	if (s.all_settled) return 'paid';
	return null;
}

export const JOB_BILLING_BADGE_LABEL: Record<JobBillingBadge, string> = {
	overdue: 'Overdue',
	needs_invoice: 'Needs Invoice',
	draft: 'Send Invoice',
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
	draft: 'info',
	awaiting_payment: 'info',
	paid: 'success'
};

// ── Billing model (Jobber billingType × billingFrequency) ─────────────────────
// One model for EVERY job. billing_type = WHAT each invoice contains; billing_frequency = WHEN to
// invoice; invoice_frequency = the cadence when billing_frequency='periodic'. Manual v1: the
// contractor presses "Generate invoice" / "Create invoice" — nothing auto-fires (deferred).
export type BillingType = 'fixed' | 'visit_based';
export type BillingFrequency = 'on_completion' | 'per_visit' | 'periodic' | 'never';
export type InvoiceFrequency = 'weekly' | 'biweekly' | 'monthly';

export const BILLING_TYPE_LABEL: Record<BillingType, string> = {
	fixed: 'Fixed price',
	visit_based: 'Visit based'
};

// One-line descriptions of each billing type — Jobber's exact wording under the recurring
// "Billing type" radios (ref/billing/10-11).
export const BILLING_TYPE_DESC: Record<BillingType, string> = {
	fixed: 'Each invoice is for a set amount.',
	visit_based: 'Visits will be listed as a billable item and grouped on one invoice.'
};

// The recurring-job "Invoice frequency" dropdown (Jobber). A synthetic key that resolves to our
// stored billing_frequency (+ invoice_recurrence for the periodic ones). 'custom' is the ACTION row
// ("Custom schedule…" — opens the recurrence modal) and is never a resting value; 'custom_saved' is
// the injected option holding a saved custom rule, and its label is the rule's friendly summary.
export type BillingRepeatMode =
	| 'on_completion'
	| 'per_visit'
	| 'never'
	| 'monthly_last'
	| 'custom_saved'
	| 'custom';

// Jobber's exact "Invoice frequency" option wording (ref/billing/11,14,15). 'custom_saved' is
// absent — its label is the friendly summary of the saved rule (summarizeRecurrence).
export const BILLING_REPEAT_LABEL: Record<Exclude<BillingRepeatMode, 'custom_saved'>, string> = {
	monthly_last: 'Monthly on the last day of the month',
	per_visit: 'After each visit is completed',
	never: 'As needed – no reminders',
	on_completion: 'Once when job is closed',
	custom: 'Custom schedule…'
};

// WHEN to invoice (Jobber BillingFrequencyEnum). 'never' = billing not set up.
export const BILLING_FREQUENCY_LABEL: Record<BillingFrequency, string> = {
	on_completion: 'When the job is complete',
	per_visit: 'On each visit',
	periodic: 'On a repeating schedule',
	never: "Don't invoice automatically"
};

// Short, human cadence labels for the periodic "how often" dropdown + detail view.
export const INVOICE_FREQUENCY_LABEL: Record<InvoiceFrequency, string> = {
	weekly: 'Weekly',
	biweekly: 'Every 2 weeks',
	monthly: 'Monthly'
};

// ── Invoice-reminder display status (Jobber B3.2) ─────────────────────────────
// A reminder stores only 'active' | 'completed' in the DB; the face the contractor sees is
// DERIVED from its scheduled date vs now — the SAME vocabulary Jobber gives a visit/scheduled
// item. Shared here (not inline in the Reminders tab) so the future schedule-calendar render
// reuses the exact same derivation. Pure date math, no fetching.
export type ReminderDisplayStatus = 'upcoming' | 'today' | 'late' | 'completed' | 'unscheduled';

// The row shape this needs — a subset of JobInvoiceReminderRow, so any reminder-like row works.
type ReminderTiming = {
	status: 'active' | 'completed';
	scheduled_start: string | null;
	scheduled_end: string | null;
	all_day: boolean;
};

export function reminderDisplayStatus(r: ReminderTiming): ReminderDisplayStatus {
	if (r.status === 'completed') return 'completed';
	// "Schedule later" — no date yet, so it can never be today/late.
	if (!r.scheduled_start) return 'unscheduled';
	const start = new Date(r.scheduled_start);
	const now = new Date();
	// Late once the reminder's END moment has passed (Jobber: "end time has passed"). End moment =
	// the end time if set, else the end of that day for an all-day reminder, else the start instant.
	const endMoment = r.scheduled_end
		? new Date(r.scheduled_end)
		: r.all_day
			? new Date(new Date(start).setHours(23, 59, 59, 999))
			: start;
	if (endMoment.getTime() < now.getTime()) return 'late';
	// Not past yet — Today if it falls on today's calendar day, else Upcoming.
	const isToday =
		start.getFullYear() === now.getFullYear() &&
		start.getMonth() === now.getMonth() &&
		start.getDate() === now.getDate();
	return isToday ? 'today' : 'upcoming';
}

export const REMINDER_DISPLAY_LABEL: Record<ReminderDisplayStatus, string> = {
	upcoming: 'Upcoming',
	today: 'Today',
	// Jobber labels a past-due invoice reminder "Overdue" (ref/billing/17) — distinct from a visit,
	// which Jobber calls "Late". The status VALUE stays 'late' (CSS + derivation), only the face reads Overdue.
	late: 'Overdue',
	completed: 'Completed',
	unscheduled: 'Unscheduled'
};
