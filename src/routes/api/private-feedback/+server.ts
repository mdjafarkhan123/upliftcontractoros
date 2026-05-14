import { json, error } from '@sveltejs/kit';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, jobs, privateFeedback } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewNegativeFeedback } from '$lib/server/reputation/permissions';

const MAX_ROWS = 200;

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewNegativeFeedback(auth.member)) error(403, 'Forbidden');

	const rows = await db
		.select({
			id: privateFeedback.id,
			contact_id: privateFeedback.contact_id,
			contact_name: contacts.full_name,
			job_id: privateFeedback.job_id,
			job_title: jobs.title,
			score: privateFeedback.score,
			body: privateFeedback.body,
			is_resolved: privateFeedback.is_resolved,
			resolved_at: privateFeedback.resolved_at,
			created_at: privateFeedback.created_at
		})
		.from(privateFeedback)
		.innerJoin(contacts, eq(contacts.id, privateFeedback.contact_id))
		.leftJoin(jobs, eq(jobs.id, privateFeedback.job_id))
		.where(and(eq(privateFeedback.org_id, auth.orgId), isNull(privateFeedback.deleted_at)))
		.orderBy(desc(privateFeedback.created_at))
		.limit(MAX_ROWS);

	const items = rows.map((r) => ({
		...r,
		resolved_at: r.resolved_at?.toISOString() ?? null,
		created_at: r.created_at.toISOString()
	}));
	return json({ items });
};
