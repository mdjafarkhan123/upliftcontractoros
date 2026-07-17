import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { db as DbClient } from '$lib/server/db/client';
import { appointments, jobs } from '$lib/server/db/schema';

type Tx = Parameters<Parameters<typeof DbClient.transaction>[0]>[0];

/**
 * Re-pin a SINGLE-VISIT job's denormalized `scheduled_start`/`scheduled_end` to the earliest
 * still-open (status = 'scheduled') dated visit, or NULL when the job has no dated open visit.
 *
 * Such a job keeps its own copy of "the schedule date" (used by the job list scopes —
 * Unscheduled/Today/Upcoming/Overdue — and the "Schedule later" toggle). The visits underneath it
 * are the real schedule (Jobber / Housecall Pro: the visit IS the job's schedule). That copy must
 * therefore follow the visits: every path that creates, dates, completes, or cancels a visit calls
 * this so the badge + toggle can't drift from what the visit rows actually say.
 *
 * Jobs whose date is a SERIES ANCHOR are deliberately excluded. The anchor is the expansion start
 * the series is regenerated from, not a mirror of any one visit, so completing or moving a single
 * visit must never shift it — doing so would silently re-cut the whole series on the next rule
 * edit. That means any job carrying a repeat rule, plus "as needed" jobs (whose date is a stored
 * job WINDOW, not work).
 *
 * The guard canNOT be `job_type = 'one_off'`: a ONE-OFF job may carry a repeat rule (Jobber — the
 * toggle sets billing, the rule sets visit generation), and its anchor needs freezing exactly like
 * a recurring job's. The test is the rule, not the type.
 *
 * Completed/cancelled/no-show visits are ignored so a job never shows a stale "Overdue" off a visit
 * that's already done.
 *
 * Caller runs inside the same transaction as the visit mutation so the two can't half-apply.
 *
 * Returns the job's fresh `scheduled_start`/`scheduled_end` after the re-pin so the caller can echo
 * it back to the client (which keeps a SEPARATE jobs cache and would otherwise show a stale badge
 * until reload). Returns `null` when no job row was actually updated — i.e. the job is a series
 * anchor (guarded out) or soft-deleted — so the caller knows there's nothing to echo.
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
				// Series anchors are excluded: a job with a repeat rule regenerates its visits from
				// this column, and an "as needed" job stores its WINDOW (start + end boundary) here.
				// Neither is a mirror of a visit, so neither may be overwritten by a visit change.
				isNull(jobs.recurrence),
				eq(jobs.schedule_as_needed, false),
				isNull(jobs.deleted_at)
			)
		)
		.returning({ scheduled_start: jobs.scheduled_start, scheduled_end: jobs.scheduled_end });

	return updated ?? null;
}
