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

	const [row] = await db
		.select({
			today: sql<number>`COUNT(*) FILTER (
				WHERE jobs.status IN ('scheduled','in_progress')
				  AND jobs.scheduled_start >= ${todayStart}::timestamptz
				  AND jobs.scheduled_start <= ${todayEnd}::timestamptz
			)::int`,
			in_progress: sql<number>`COUNT(*) FILTER (WHERE jobs.status = 'in_progress')::int`,
			on_hold: sql<number>`COUNT(*) FILTER (WHERE jobs.status = 'on_hold')::int`,
			awaiting_review: sql<number>`COUNT(*) FILTER (
				WHERE jobs.status = 'completed'
				  AND NOT EXISTS (
					SELECT 1 FROM review_requests
					WHERE review_requests.job_id = jobs.id
					  AND review_requests.status IN ('likely_reviewed','completed_internal')
				)
			)::int`,
			// Four date-derived faces of a stored 'scheduled' job (mirrors deriveJobScheduleState):
			// pending = no date · upcoming = future · today = today · overdue = date passed. A job
			// that has been started reports as in_progress, never today/overdue.
			pending: sql<number>`COUNT(*) FILTER (
				WHERE jobs.status = 'scheduled'
				  AND jobs.scheduled_start IS NULL
			)::int`,
			upcoming: sql<number>`COUNT(*) FILTER (
				WHERE jobs.status = 'scheduled'
				  AND jobs.scheduled_start > ${todayEnd}::timestamptz
			)::int`,
			today_scheduled: sql<number>`COUNT(*) FILTER (
				WHERE jobs.status = 'scheduled'
				  AND jobs.scheduled_start >= ${todayStart}::timestamptz
				  AND jobs.scheduled_start <= ${todayEnd}::timestamptz
			)::int`,
			overdue: sql<number>`COUNT(*) FILTER (
				WHERE jobs.status = 'scheduled'
				  AND jobs.scheduled_start < ${todayStart}::timestamptz
			)::int`,
			completed: sql<number>`COUNT(*) FILTER (WHERE jobs.status = 'completed')::int`,
			cancelled: sql<number>`COUNT(*) FILTER (WHERE jobs.status = 'cancelled')::int`
		})
		.from(jobs)
		.where(and(...scopeFilters));

	return json({
		data: {
			// Legacy KPI cards (current page) — kept until Session 2 swaps the UI.
			today: row?.today ?? 0,
			in_progress: row?.in_progress ?? 0,
			awaiting_review: row?.awaiting_review ?? 0,
			unscheduled: row?.pending ?? 0,
			// Redesigned KPI strip — one count per display state.
			status_counts: {
				pending: row?.pending ?? 0,
				upcoming: row?.upcoming ?? 0,
				today: row?.today_scheduled ?? 0,
				overdue: row?.overdue ?? 0,
				in_progress: row?.in_progress ?? 0,
				on_hold: row?.on_hold ?? 0,
				completed: row?.completed ?? 0,
				cancelled: row?.cancelled ?? 0
			}
		}
	});
};
