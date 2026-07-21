import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobs } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewAnyJob } from '$lib/server/jobs/permissions';

function startOfTodayUtc(): Date {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d;
}

function endOfTodayUtc(): Date {
	const d = new Date();
	d.setHours(23, 59, 59, 999);
	return d;
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyJob(auth.member)) error(403, 'Forbidden');

	const scopeFilters: SQL[] = [eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)];
	if (!auth.member.can_view_full_pipeline) {
		scopeFilters.push(eq(jobs.assigned_to, auth.member.id));
	}

	const todayStart = startOfTodayUtc().toISOString();
	const todayEnd = endOfTodayUtc().toISOString();

	// Compute each job's visit-truth state ONCE (mirrors deriveJobScheduleState), then count faces
	// off it. The dated faces + Action Required are driven by the next OPEN visit, not the job's
	// single denormalized date — so recurring/multi-visit jobs are counted where their badge sits.
	const [row] = await db.execute<{
		today_active: number;
		awaiting_review: number;
		unscheduled: number;
		upcoming: number;
		today_scheduled: number;
		late: number;
		action_required: number;
		completed: number;
		cancelled: number;
	}>(sql`
		WITH job_state AS (
			SELECT
				jobs.status AS status,
				jobs.completed_at AS completed_at,
				jobs.cancelled_at AS cancelled_at,
				EXISTS (SELECT 1 FROM appointments a
					WHERE a.job_id = jobs.id AND a.deleted_at IS NULL
					  AND a.status IN ('scheduled','unscheduled')) AS has_open,
				COALESCE(
					(SELECT MIN(a.scheduled_start) FROM appointments a
						WHERE a.job_id = jobs.id AND a.deleted_at IS NULL AND a.status = 'scheduled'),
					-- Legacy fallback, valid ONLY when scheduled_start mirrors a single visit. A job
					-- with a repeat rule (of EITHER type — a one-off may repeat) or an "as needed"
					-- job stores a frozen series anchor / job window there, which is not a visit
					-- date. Must stay identical to effOpenStartSql in /api/jobs.
					CASE WHEN jobs.recurrence IS NULL AND NOT jobs.schedule_as_needed
						AND NOT EXISTS (SELECT 1 FROM appointments a
							WHERE a.job_id = jobs.id AND a.deleted_at IS NULL
							  AND a.status IN ('scheduled','unscheduled'))
						THEN jobs.scheduled_start END
				) AS eff_open_start,
				EXISTS (SELECT 1 FROM review_requests
					WHERE review_requests.job_id = jobs.id
					  AND review_requests.status IN ('likely_reviewed','completed_internal')) AS reviewed
			FROM jobs
			WHERE ${and(...scopeFilters)}
		)
		SELECT
			COUNT(*) FILTER (WHERE status = 'active'
				AND eff_open_start >= ${todayStart}::timestamptz
				AND eff_open_start <= ${todayEnd}::timestamptz)::int AS today_active,
			-- A closed-as-completed job (archived + completed_at) that hasn't yet been reviewed.
			COUNT(*) FILTER (WHERE status = 'archived' AND completed_at IS NOT NULL AND NOT reviewed)::int AS awaiting_review,
			COUNT(*) FILTER (WHERE status = 'active' AND eff_open_start IS NULL AND has_open)::int AS unscheduled,
			COUNT(*) FILTER (WHERE status = 'active' AND eff_open_start > ${todayEnd}::timestamptz)::int AS upcoming,
			COUNT(*) FILTER (WHERE status = 'active'
				AND eff_open_start >= ${todayStart}::timestamptz
				AND eff_open_start <= ${todayEnd}::timestamptz)::int AS today_scheduled,
			COUNT(*) FILTER (WHERE status = 'active' AND eff_open_start < ${todayStart}::timestamptz)::int AS late,
			COUNT(*) FILTER (WHERE status = 'active' AND eff_open_start IS NULL AND NOT has_open)::int AS action_required,
			-- Archived jobs, split by WHY they closed (Jobber stores only archived; the close
			-- timestamp is the discriminator). Cancelled wins if both somehow set.
			COUNT(*) FILTER (WHERE status = 'archived' AND cancelled_at IS NULL AND completed_at IS NOT NULL)::int AS completed,
			COUNT(*) FILTER (WHERE status = 'archived' AND cancelled_at IS NOT NULL)::int AS cancelled
		FROM job_state
	`);

	return json({
		data: {
			// Legacy KPI cards (current page). `in_progress` no longer exists (Jobber model) —
			// surface Late instead, the most actionable at-a-glance number.
			today: row?.today_active ?? 0,
			late: row?.late ?? 0,
			awaiting_review: row?.awaiting_review ?? 0,
			unscheduled: row?.unscheduled ?? 0,
			// Redesigned KPI strip — one count per display state.
			status_counts: {
				unscheduled: row?.unscheduled ?? 0,
				upcoming: row?.upcoming ?? 0,
				today: row?.today_scheduled ?? 0,
				late: row?.late ?? 0,
				action_required: row?.action_required ?? 0,
				completed: row?.completed ?? 0,
				cancelled: row?.cancelled ?? 0
			}
		}
	});
};
