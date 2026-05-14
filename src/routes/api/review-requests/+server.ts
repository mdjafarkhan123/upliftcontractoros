import { json, error } from '@sveltejs/kit';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, jobs, reviewRequests } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewReviews } from '$lib/server/reputation/permissions';

const MAX_ROWS = 200;

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewReviews(auth.member)) error(403, 'Forbidden');

	const rows = await db
		.select({
			id: reviewRequests.id,
			job_id: reviewRequests.job_id,
			job_title: jobs.title,
			job_status: jobs.status,
			contact_id: reviewRequests.contact_id,
			contact_name: contacts.full_name,
			status: reviewRequests.status,
			response_score: reviewRequests.response_score,
			sent_by_automation: reviewRequests.sent_by_automation,
			sent_at: reviewRequests.sent_at,
			responded_at: reviewRequests.responded_at,
			created_at: reviewRequests.created_at
		})
		.from(reviewRequests)
		.innerJoin(contacts, eq(contacts.id, reviewRequests.contact_id))
		.innerJoin(jobs, eq(jobs.id, reviewRequests.job_id))
		.where(and(eq(reviewRequests.org_id, auth.orgId), isNull(reviewRequests.deleted_at)))
		.orderBy(desc(reviewRequests.created_at))
		.limit(MAX_ROWS);

	const items = rows.map((r) => ({
		...r,
		sent_at: r.sent_at?.toISOString() ?? null,
		responded_at: r.responded_at?.toISOString() ?? null,
		created_at: r.created_at.toISOString()
	}));
	return json({ items });
};
