import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { db as DbClient } from '$lib/server/db/client';
import { appointments, jobs } from '$lib/server/db/schema';

type Tx = Parameters<Parameters<typeof DbClient.transaction>[0]>[0];

/**
 * Re-pin a ONE-OFF job's denormalized `scheduled_start`/`scheduled_end` to the earliest still-open
 * (status = 'scheduled') dated visit, or NULL when the job has no dated open visit.
 *
 * A one-off job keeps its own copy of "the schedule date" (used by the job list scopes —
 * Unscheduled/Today/Upcoming/Overdue — and the "Schedule later" toggle). The visits underneath it
 * are the real schedule (Jobber / Housecall Pro: the visit IS the job's schedule). That copy must
 * therefore follow the visits: every path that creates, dates, completes, or cancels a visit calls
 * this so the badge + toggle can't drift from what the visit rows actually say.
 *
 * Recurring jobs are deliberately excluded (the `recurrence IS NULL` guard): their job row is the
 * SERIES anchor, not a mirror of any single visit — moving/completing one visit must not shift it.
 * Completed/cancelled/no-show visits are ignored so a job never shows a stale "Overdue" off a visit
 * that's already done.
 *
 * Caller runs inside the same transaction as the visit mutation so the two can't half-apply.
 *
 * Returns the job's fresh `scheduled_start`/`scheduled_end` after the re-pin so the caller can echo
 * it back to the client (which keeps a SEPARATE jobs cache and would otherwise show a stale badge
 * until reload). Returns `null` when no one-off job row was actually updated — i.e. the job is
 * recurring (series anchor, guarded out) or soft-deleted — so the caller knows there's nothing to
 * echo.
 */
export async function repinOneOffJobSchedule(
	tx: Tx,
	opts: { orgId: string; jobId: string }
): Promise<{ scheduled_start: Date | null; scheduled_end: Date | null } | null> {
	const { orgId, jobId } = opts;

	const [earliest] = await tx
		.select({
			start: appointments.scheduled_start,
			end: appointments.scheduled_end
		})
		.from(appointments)
		.where(
			and(
				eq(appointments.job_id, jobId),
				eq(appointments.org_id, orgId),
				isNull(appointments.deleted_at),
				eq(appointments.status, 'scheduled'),
				isNotNull(appointments.scheduled_start)
			)
		)
		.orderBy(asc(appointments.scheduled_start))
		.limit(1);

	const [updated] = await tx
		.update(jobs)
		.set({
			scheduled_start: earliest?.start ?? null,
			scheduled_end: earliest?.end ?? null,
			updated_at: new Date()
		})
		.where(
			and(
				eq(jobs.id, jobId),
				eq(jobs.org_id, orgId),
				isNull(jobs.recurrence),
				isNull(jobs.deleted_at)
			)
		)
		.returning({ scheduled_start: jobs.scheduled_start, scheduled_end: jobs.scheduled_end });

	return updated ?? null;
}
