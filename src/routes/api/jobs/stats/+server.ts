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
		in_progress: number;
		on_hold: number;
		awaiting_review: number;
		pending: number;
		upcoming: number;
		today_scheduled: number;
		overdue: number;
		action_required: number;
		completed: number;
		cancelled: number;
	}>(sql`
		WITH job_state AS (
			SELECT
				jobs.status AS status,
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
			COUNT(*) FILTER (WHERE status IN ('scheduled','in_progress')
				AND eff_open_start >= ${todayStart}::timestamptz
				AND eff_open_start <= ${todayEnd}::timestamptz)::int AS today_active,
			COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
			COUNT(*) FILTER (WHERE status = 'on_hold')::int AS on_hold,
			COUNT(*) FILTER (WHERE status = 'completed' AND NOT reviewed)::int AS awaiting_review,
			COUNT(*) FILTER (WHERE status = 'scheduled' AND eff_open_start IS NULL AND has_open)::int AS pending,
			COUNT(*) FILTER (WHERE status = 'scheduled' AND eff_open_start > ${todayEnd}::timestamptz)::int AS upcoming,
			COUNT(*) FILTER (WHERE status = 'scheduled'
				AND eff_open_start >= ${todayStart}::timestamptz
				AND eff_open_start <= ${todayEnd}::timestamptz)::int AS today_scheduled,
			COUNT(*) FILTER (WHERE status = 'scheduled' AND eff_open_start < ${todayStart}::timestamptz)::int AS overdue,
			COUNT(*) FILTER (WHERE status = 'scheduled' AND eff_open_start IS NULL AND NOT has_open)::int AS action_required,
			COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
			COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
		FROM job_state
	`);

	return json({
		data: {
			// Legacy KPI cards (current page) — kept until Session 2 swaps the UI.
			today: row?.today_active ?? 0,
			in_progress: row?.in_progress ?? 0,
			awaiting_review: row?.awaiting_review ?? 0,
			unscheduled: row?.pending ?? 0,
			// Redesigned KPI strip — one count per display state.
			status_counts: {
				pending: row?.pending ?? 0,
				upcoming: row?.upcoming ?? 0,
				today: row?.today_scheduled ?? 0,
				overdue: row?.overdue ?? 0,
				action_required: row?.action_required ?? 0,
				in_progress: row?.in_progress ?? 0,
				on_hold: row?.on_hold ?? 0,
				completed: row?.completed ?? 0,
				cancelled: row?.cancelled ?? 0
			}
		}
	});
};
