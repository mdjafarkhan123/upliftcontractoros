import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { appointments, requests } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewRequests } from '$lib/server/requests/permissions';
import { deriveRequestStatus } from '$lib/server/requests/status';
import type { RequestStats } from '$lib/types/requests';

// KPI payload for the requests list page (8.jpg): Overview status counts +
// new-requests-past-30d trend + 30-day conversion rate. Status is DERIVED
// (deriveRequestStatus is the single source of truth), so this pulls the
// minimal facts for every live request in ONE query and counts in JS —
// duplicating the derivation in SQL would let the two drift apart.
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewRequests(auth.member)) error(403, 'Forbidden');
	const timezone = auth.org.timezone || 'America/Chicago';

	const rows = await db
		.select({
			approval_state: requests.approval_state,
			converted_at: requests.converted_at,
			archived_at: requests.archived_at,
			created_at: requests.created_at,
			assessment_status: appointments.status,
			assessment_start: appointments.scheduled_start,
			assessment_end: appointments.scheduled_end,
			assessment_all_day: appointments.all_day
		})
		.from(requests)
		.leftJoin(
			appointments,
			and(eq(appointments.request_id, requests.id), isNull(appointments.deleted_at))
		)
		.where(and(eq(requests.org_id, auth.orgId), isNull(requests.deleted_at)));

	const now = Date.now();
	const DAY = 86_400_000;
	const cutoff30 = now - 30 * DAY;
	const cutoff60 = now - 60 * DAY;

	const stats: RequestStats = {
		needs_approval: 0,
		new: 0,
		assessment_completed: 0,
		overdue: 0,
		unscheduled: 0,
		new_past_30d: 0,
		new_prev_30d: 0,
		conversion_rate_30d: 0
	};
	let created30 = 0;
	let converted30 = 0;

	for (const r of rows) {
		const status = deriveRequestStatus(
			{
				approval_state: r.approval_state,
				converted_at: r.converted_at,
				archived_at: r.archived_at
			},
			r.assessment_status
				? {
						status: r.assessment_status,
						scheduled_start: r.assessment_start,
						scheduled_end: r.assessment_end,
						all_day: r.assessment_all_day ?? false
					}
				: null,
			{ timezone }
		);

		if (status === 'needs_approval') stats.needs_approval += 1;
		else if (status === 'new') stats.new += 1;
		else if (status === 'assessment_completed') stats.assessment_completed += 1;
		else if (status === 'overdue') stats.overdue += 1;
		else if (status === 'unscheduled') stats.unscheduled += 1;

		const createdMs = r.created_at.getTime();
		if (createdMs >= cutoff30) {
			created30 += 1;
			if (r.converted_at) converted30 += 1;
		} else if (createdMs >= cutoff60) {
			stats.new_prev_30d += 1;
		}
	}

	stats.new_past_30d = created30;
	stats.conversion_rate_30d = created30 > 0 ? Math.round((converted30 / created30) * 100) : 0;

	return json({ data: stats });
};
