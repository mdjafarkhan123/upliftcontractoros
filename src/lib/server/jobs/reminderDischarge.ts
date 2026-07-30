// Auto-complete a job's invoice reminders when an invoice is created (Jobber B3.2).
//
// A reminder is a contractor to-do: "around this date, remember to invoice this job." Once an
// invoice actually gets created it has served its purpose, so it auto-completes. Two ways a
// reminder is discharged by a new invoice — this helper applies BOTH in one update:
//
//   1. PER-VISIT: a visit_based invoice bills specific visits; each billed visit's own auto
//      reminder (visit_id match) is done, even if that visit is invoiced ahead of its date.
//   2. DATE-WINDOW: any reminder whose date interval overlaps TODAY clears — "if an invoice is
//      created within the reminder's date range, the reminder is marked done" (the contractor's
//      rule). A reminder dated in the future, or a range that doesn't cover today, is left alone
//      (Scenario: a reminder set for the 24th survives invoicing on the 22nd — it only clears
//      when an invoice is created on the 24th). A schedule-later reminder (no date) is untouched.
//
// Runs for EVERY job-invoice path (generate-invoice, convert-to-invoice, milestone invoice), so a
// fixed/periodic invoice with no billed visits still clears a due date-window reminder. Must run
// INSIDE the caller's invoice transaction.

import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { jobInvoiceReminders } from '$lib/server/db/schema';

type Tx = PgTransaction<any, any, any>;

export async function dischargeJobInvoiceReminders(
	tx: Tx,
	opts: {
		orgId: string;
		jobId: string;
		now: Date;
		/** Visits billed by this invoice (visit_based). Omitted/empty for fixed & periodic. */
		billedVisitIds?: string[];
		/** The member who created the invoice (stamped as completed_by), or null for system. */
		completedBy: string | null;
	}
): Promise<void> {
	const { orgId, jobId, now, completedBy } = opts;
	const billedVisitIds = opts.billedVisitIds ?? [];

	// End-of-today (server-local) — the SAME reference frame reminderDisplayStatus uses to derive
	// Today / Overdue. Passed to the raw SQL as an ISO string with an explicit ::timestamptz cast:
	// a bare JS Date can't be serialized as an untyped parameter inside a raw sql fragment (the
	// driver only accepts a string/Buffer there), and a raw string has no column-type context to
	// infer the cast from.
	const todayEnd = new Date(now);
	todayEnd.setHours(23, 59, 59, 999);
	const todayEndIso = todayEnd.toISOString();

	// The reminder has come DUE (its date is today or already past). Creating an invoice satisfies
	// the nudge, so it clears. A FUTURE reminder (start after today) is NOT due yet and survives —
	// it waits for its own date, or an invoice created on/after that date. Schedule-later reminders
	// (null start) never have a due date and are never touched here.
	const dueOnOrBeforeToday = sql`
		${jobInvoiceReminders.scheduled_start} IS NOT NULL
		AND ${jobInvoiceReminders.scheduled_start} <= ${todayEndIso}::timestamptz
	`;

	// A billed visit's reminder clears regardless of date; otherwise only the due-date rule applies.
	const match =
		billedVisitIds.length > 0
			? or(inArray(jobInvoiceReminders.visit_id, billedVisitIds), dueOnOrBeforeToday)
			: dueOnOrBeforeToday;

	await tx
		.update(jobInvoiceReminders)
		.set({
			status: 'completed',
			completed_at: now,
			completed_by: completedBy,
			updated_at: now
		})
		.where(
			and(
				eq(jobInvoiceReminders.org_id, orgId),
				eq(jobInvoiceReminders.job_id, jobId),
				eq(jobInvoiceReminders.status, 'active'),
				isNull(jobInvoiceReminders.deleted_at),
				match
			)
		);
}
