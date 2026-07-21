import type { JobStatus } from '$lib/types/jobs';

// The precise, user-facing state shown on a job (badge, tabs, KPI). Jobber's model: the STORED
// status is only open (`active`) vs closed (`archived`) — everything a contractor sees day-to-day is
// DERIVED here from the job's visits. An `active` job shows one of five visit-derived faces:
//   • unscheduled     — has open visits but none has a date yet (Jobber "Schedule later")
//   • upcoming        — next open visit is in the future
//   • today           — next open visit is today, not yet completed
//   • late            — next open visit's date has passed and it was never completed (Jobber "Late")
//   • action_required — active but NO open visits remain: all done, or an "as needed" job with none
//                       yet. Jobber's `action_required` — prompt to schedule more or close the job.
// An `archived` (closed) job shows WHY it closed, read from the close timestamps (display only — the
// stored status is just `archived`): `completed` (completed_at set) or `cancelled` (cancelled_at
// set). This keeps our friendlier "Completed vs Cancelled" labels while the underlying model stays
// exactly Jobber's active/archived.
//
// NOTE: the money dimension (Jobber's `requires_invoicing`) is intentionally NOT folded in here — it
// is surfaced by the separate billing badge (deriveJobBillingBadge in $lib/jobs/billing.ts), which
// already computes overdue-invoice / needs-invoice / awaiting-payment / paid. Schedule-state stays
// about the SCHEDULE; billing badge stays about the MONEY. Jobber crams both into one enum; keeping
// them as two orthogonal badges is cleaner and matches our existing architecture.
export type JobScheduleState =
	| 'unscheduled'
	| 'upcoming'
	| 'today'
	| 'late'
	| 'action_required'
	| 'completed'
	| 'cancelled'
	| 'archived';

// The visit-truth signals a display state is derived from. These come from the job's actual visit
// rows (appointments), NOT the job's single denormalized date — which is why the badge is now exact
// for recurring / multi-visit jobs (their stored `scheduled_start` is the frozen series anchor and
// would otherwise show a stale "Late").
//   • nextOpenVisitStart — earliest still-open ('scheduled' status) DATED visit; null if none dated.
//   • hasOpenVisits      — any still-open visit exists at all ('scheduled' or 'unscheduled' status).
//   • scheduledStart     — the job's own denormalized date. Used ONLY as a fallback when the job
//                          somehow has no visit rows (legacy safety net), and only when that column
//                          actually mirrors a visit — see hasSeriesAnchor.
//   • hasSeriesAnchor    — the job's `scheduled_start` is a SERIES ANCHOR, not a mirror of a visit:
//                          true when the job has a repeat rule (the frozen expansion start) or is
//                          "as needed" (a stored job window). Such a date is never a real visit
//                          date, so the fallback must not read it. This is NOT "is recurring": a
//                          ONE-OFF job may carry a repeat rule, and its anchor is just as frozen.
//   • completedAt / cancelledAt — the close timestamps, read only when the job is `archived` to
//                          choose the Completed vs Cancelled display face.
export type JobScheduleSignals = {
	status: JobStatus;
	hasSeriesAnchor?: boolean;
	scheduledStart?: string | Date | null;
	nextOpenVisitStart?: string | Date | null;
	hasOpenVisits?: boolean;
	completedAt?: string | Date | null;
	cancelledAt?: string | Date | null;
};

function toDate(value: string | Date | null | undefined): Date | null {
	if (!value) return null;
	const d = value instanceof Date ? value : new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
}

// Derive the display state from the stored status + the job's visit signals. `now` is injectable
// for consistent day boundaries / tests. The four dated faces + Action Required all fall out of the
// next OPEN visit rather than the job's single (possibly stale) date.
export function deriveJobScheduleState(
	sig: JobScheduleSignals,
	now: Date = new Date()
): JobScheduleState {
	// Closed job: show WHY it closed (display only — the stored status is just `archived`).
	if (sig.status === 'archived') {
		if (toDate(sig.cancelledAt)) return 'cancelled';
		if (toDate(sig.completedAt)) return 'completed';
		return 'archived';
	}

	// The date to judge against: the next open dated visit if any; otherwise, for a job that has NO
	// open visits and no visit rows at all (legacy), fall back to the job's own denormalized date.
	// A job whose date is a series anchor never falls back — that date is not a visit.
	const openDate =
		toDate(sig.nextOpenVisitStart) ??
		(!sig.hasSeriesAnchor && !sig.hasOpenVisits ? toDate(sig.scheduledStart) : null);

	if (openDate) {
		const dayStart = new Date(now);
		dayStart.setHours(0, 0, 0, 0);
		const dayEnd = new Date(now);
		dayEnd.setHours(23, 59, 59, 999);

		if (openDate > dayEnd) return 'upcoming';
		if (openDate >= dayStart) return 'today';
		return 'late';
	}

	// No dated open visit. Open placeholder(s) waiting for a date → Unscheduled; otherwise the job
	// has run out of open visits entirely → Action Required (schedule more or close).
	if (sig.hasOpenVisits) return 'unscheduled';
	return 'action_required';
}

const LABELS: Record<JobScheduleState, string> = {
	unscheduled: 'Unscheduled',
	upcoming: 'Upcoming',
	today: 'Today',
	late: 'Late',
	action_required: 'Action Required',
	completed: 'Completed',
	cancelled: 'Cancelled',
	archived: 'Closed'
};

export function jobScheduleStateLabel(state: JobScheduleState): string {
	return LABELS[state];
}
