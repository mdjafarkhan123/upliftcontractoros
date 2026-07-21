// Auto-generated invoice reminders (Jobber B3.2).
//
// A job's `billing_frequency` is the reminder GENERATOR: picking "After each visit",
// "Monthly on the last day", etc. materializes one contractor-facing invoice reminder
// per invoice occurrence, each starting life as an "Upcoming" calendar task on the
// job's Reminders tab. This module owns that reconcile.
//
// Design law (why this file is small and safe):
//  • Reminders are the PROMPT layer, never the money-truth. "Requires Invoicing" is
//    still derived from visit + milestone state (see deriveJobBillingBadge / the jobs
//    list query) — we do NOT rewire that onto this table.
//  • Only source='auto' rows are ever touched. A frequency change, a schedule rebuild,
//    an invoicing-clear — none of them may delete or mutate a source='manual' reminder
//    the contractor added by hand.
//  • Reconcile, don't wipe-and-rebuild: existing future auto reminders that still match
//    the desired set are kept (so any crew/edits on them survive); only the genuinely
//    stale ones are removed and only the missing ones inserted. Past/completed auto
//    reminders are frozen — identical to the "freeze the past, rebuild the future" rule
//    the recurring-visit engine already follows.

import { and, eq, gt, isNull } from 'drizzle-orm';
import { inArray } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { appointments, jobInvoiceReminderAssignees, jobInvoiceReminders, jobs } from '$lib/server/db/schema';
import { expandRecurrence, type InvoiceRecurrence, type JobRecurrence } from './recurrence';

type Tx = PgTransaction<any, any, any>;

// Default descriptions Jobber pre-fills on an auto reminder (the contractor can edit them).
const AUTO_DESC = {
	per_visit: 'Invoice this visit',
	on_completion: 'Invoice when the job is closed',
	periodic: 'Invoice for this billing period'
} as const;

// A `Date` → 'YYYY-MM-DD' in UTC, matching how the recurrence engine reasons about dates.
function toYmd(d: Date): string {
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
		d.getUTCDate()
	).padStart(2, '0')}`;
}

/**
 * Expand a PERIODIC invoice rule into its concrete occurrence dates, bounded by the job's
 * own window. Jobber's billing section shows no end picker for periodic invoicing — the
 * schedule inherits the job's start/end — so we synthesize the end from `jobEnd` (or fall
 * back to the recurrence engine's 2-year horizon when the job is open-ended).
 */
export function expandInvoiceReminders(
	jobStart: Date,
	jobEnd: Date | null,
	rule: InvoiceRecurrence
): Date[] {
	const full: JobRecurrence = jobEnd
		? { ...rule, end_type: 'on', end_on: toYmd(jobEnd) }
		: { ...rule, end_type: 'after', end_after_count: 24, end_after_unit: 'months' };
	return expandRecurrence(jobStart, null, full).map((v) => v.start);
}

type DesiredReminder = {
	key: string;
	visit_id: string | null;
	start: Date | null;
	end: Date | null;
	description: string;
};

// A stable key so a desired reminder can be matched against an existing row: per-visit
// reminders key on their visit; dated non-visit reminders key on their instant; an undated
// (schedule-later) reminder keys on the null sentinel.
function keyOf(visitId: string | null, start: Date | null): string {
	if (visitId) return `v:${visitId}`;
	return start ? `t:${start.getTime()}` : 't:null';
}

// The set of auto reminders the job's current billing config SHOULD have, in the future.
async function computeDesired(
	tx: Tx,
	orgId: string,
	jobId: string,
	job: {
		billing_type: string;
		billing_frequency: string;
		invoice_recurrence: InvoiceRecurrence | null;
		scheduled_start: Date | null;
		scheduled_end: Date | null;
	},
	now: Date
): Promise<DesiredReminder[]> {
	const freq = job.billing_frequency;
	if (freq === 'never') return [];

	if (freq === 'per_visit') {
		// Fixed-price recurring can't invoice per visit (Jobber hides the option, ref/billing/15).
		if (job.billing_type !== 'visit_based') return [];
		// One reminder per future, still-open, unbilled visit — matching the visit-regen horizon
		// (gt(scheduled_start, now)), so past visits keep their frozen reminders untouched.
		const visits = await tx
			.select({
				id: appointments.id,
				scheduled_start: appointments.scheduled_start,
				scheduled_end: appointments.scheduled_end
			})
			.from(appointments)
			.where(
				and(
					eq(appointments.job_id, jobId),
					eq(appointments.org_id, orgId),
					isNull(appointments.deleted_at),
					eq(appointments.status, 'scheduled'),
					isNull(appointments.billed_invoice_id),
					gt(appointments.scheduled_start, now)
				)
			);
		return visits.map((v) => ({
			key: keyOf(v.id, v.scheduled_start),
			visit_id: v.id,
			start: v.scheduled_start,
			end: v.scheduled_end,
			description: AUTO_DESC.per_visit
		}));
	}

	if (freq === 'on_completion') {
		// Exactly one reminder, dated to the job's planned end (Jobber shows the on-close reminder
		// with a date). Null when no end is set yet — it becomes dated when the job is closed.
		const end = job.scheduled_end ?? null;
		return [
			{
				key: keyOf(null, end),
				visit_id: null,
				start: end,
				end: null,
				description: AUTO_DESC.on_completion
			}
		];
	}

	// periodic
	const rule = job.invoice_recurrence;
	if (!rule || !job.scheduled_start) return [];
	return expandInvoiceReminders(job.scheduled_start, job.scheduled_end ?? null, rule)
		.filter((d) => d.getTime() > now.getTime())
		.map((d) => ({
			key: keyOf(null, d),
			visit_id: null,
			start: d,
			end: null,
			description: AUTO_DESC.periodic
		}));
}

/**
 * Reconcile a job's auto invoice reminders to its current billing config. Idempotent: safe to
 * call on every create and on every billing/recurrence PATCH. Must run INSIDE the caller's
 * transaction (alongside the visit writes it depends on).
 */
export async function syncAutoReminders(tx: Tx, orgId: string, jobId: string): Promise<void> {
	const now = new Date();

	const [job] = await tx
		.select({
			billing_type: jobs.billing_type,
			billing_frequency: jobs.billing_frequency,
			invoice_recurrence: jobs.invoice_recurrence,
			scheduled_start: jobs.scheduled_start,
			scheduled_end: jobs.scheduled_end,
			assigned_to: jobs.assigned_to
		})
		.from(jobs)
		.where(and(eq(jobs.id, jobId), eq(jobs.org_id, orgId)))
		.limit(1);
	if (!job) return;

	// Live auto reminders only — manual rows are invisible to this engine.
	const existing = await tx
		.select({
			id: jobInvoiceReminders.id,
			visit_id: jobInvoiceReminders.visit_id,
			scheduled_start: jobInvoiceReminders.scheduled_start,
			status: jobInvoiceReminders.status
		})
		.from(jobInvoiceReminders)
		.where(
			and(
				eq(jobInvoiceReminders.org_id, orgId),
				eq(jobInvoiceReminders.job_id, jobId),
				eq(jobInvoiceReminders.source, 'auto'),
				isNull(jobInvoiceReminders.deleted_at)
			)
		);

	// Frozen = done, or already due/past (start <= now). Regenerable = future & still active.
	const isFrozen = (r: { status: string; scheduled_start: Date | null }) =>
		r.status === 'completed' || (r.scheduled_start != null && r.scheduled_start.getTime() <= now.getTime());
	const regenerable = existing.filter((r) => !isFrozen(r));

	const desired = await computeDesired(tx, orgId, jobId, job, now);
	const desiredByKey = new Map(desired.map((d) => [d.key, d]));

	// Keys already represented by ANY live auto reminder (frozen or regenerable) — never re-insert.
	const existingKeys = new Set(existing.map((r) => keyOf(r.visit_id, r.scheduled_start)));

	// Delete regenerable rows that the new config no longer wants.
	const toDelete = regenerable
		.filter((r) => !desiredByKey.has(keyOf(r.visit_id, r.scheduled_start)))
		.map((r) => r.id);
	if (toDelete.length > 0) {
		await tx
			.delete(jobInvoiceReminderAssignees)
			.where(inArray(jobInvoiceReminderAssignees.reminder_id, toDelete));
		await tx
			.update(jobInvoiceReminders)
			.set({ deleted_at: now, updated_at: now })
			.where(inArray(jobInvoiceReminders.id, toDelete));
	}

	// Insert desired rows that don't already exist.
	const toInsert = desired.filter((d) => !existingKeys.has(d.key));
	if (toInsert.length > 0) {
		await tx.insert(jobInvoiceReminders).values(
			toInsert.map((d) => ({
				org_id: orgId,
				job_id: jobId,
				source: 'auto',
				// Denormalized lead only; auto reminders don't seed the crew join table.
				assigned_to: job.assigned_to ?? null,
				visit_id: d.visit_id,
				description: d.description,
				scheduled_start: d.start,
				scheduled_end: d.end,
				all_day: false,
				status: 'active' as const
			}))
		);
	}
}
