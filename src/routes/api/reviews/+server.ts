import { json, error } from '@sveltejs/kit';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, jobs, reviews } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewReviews } from '$lib/server/reputation/permissions';
import { textMatch, textRank } from '$lib/server/search/textSearch';

const MAX_ROWS = 200;

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewReviews(auth.member)) error(403, 'Forbidden');

	const searchRaw = (event.url.searchParams.get('q') ?? '').trim();
	const isSearching = searchRaw.length > 0;

	const conditions: SQL[] = [eq(reviews.org_id, auth.orgId)];

	// Fuzzy search across the customer name/company, the linked job title, and
	// the review text itself. Indexed by 0081 (reviews.body), 0080 (jobs.title)
	// and 0079 (contacts.*). When searching we order by relevance bucket; the
	// customer name is the primary field (exact-name match ranks top).
	const searchFields = [contacts.full_name, contacts.company_name, jobs.title, reviews.body];
	let relevance: SQL<number> | null = null;
	if (isSearching) {
		relevance = textRank(searchRaw, searchFields);
		conditions.push(textMatch(searchRaw, searchFields));
	}

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
		.where(and(...conditions))
		.orderBy(...(relevance ? [relevance] : []), desc(reviews.created_at))
		.limit(MAX_ROWS);

	const items = rows.map((r) => ({
		...r,
		created_at: r.created_at.toISOString()
	}));
	return json({ items });
};
