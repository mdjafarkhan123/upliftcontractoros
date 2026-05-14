import { json, error } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, jobs, reviews } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewReviews } from '$lib/server/reputation/permissions';

const MAX_ROWS = 200;

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewReviews(auth.member)) error(403, 'Forbidden');

	const rows = await db
		.select({
			id: reviews.id,
			contact_id: reviews.contact_id,
			contact_name: contacts.full_name,
			job_id: reviews.job_id,
			job_title: jobs.title,
			score: reviews.score,
			platform: reviews.platform,
			body: reviews.body,
			created_at: reviews.created_at
		})
		.from(reviews)
		.innerJoin(contacts, eq(contacts.id, reviews.contact_id))
		.leftJoin(jobs, eq(jobs.id, reviews.job_id))
		.where(eq(reviews.org_id, auth.orgId))
		.orderBy(desc(reviews.created_at))
		.limit(MAX_ROWS);

	const items = rows.map((r) => ({
		...r,
		created_at: r.created_at.toISOString()
	}));
	return json({ items });
};
