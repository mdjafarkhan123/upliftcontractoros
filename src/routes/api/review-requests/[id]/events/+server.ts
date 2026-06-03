import { json, error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { reviewEvents, reviewRequests } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewReviews } from '$lib/server/reputation/permissions';
import type { ReviewEventListItem } from '$lib/types/reputation';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewReviews(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	// Tenant isolation: confirm the review request belongs to this org before
	// returning its event log.
	const [request] = await db
		.select({ id: reviewRequests.id })
		.from(reviewRequests)
		.where(and(eq(reviewRequests.id, id), eq(reviewRequests.org_id, auth.orgId)))
		.limit(1);

	if (!request) error(404, 'Not found');

	const rows = await db
		.select({
			id: reviewEvents.id,
			type: reviewEvents.type,
			rating: reviewEvents.rating,
			nudge_number: reviewEvents.nudge_number,
			confidence_score: reviewEvents.confidence_score,
			created_at: reviewEvents.created_at
		})
		.from(reviewEvents)
		.where(and(eq(reviewEvents.review_request_id, id), eq(reviewEvents.org_id, auth.orgId)))
		.orderBy(asc(reviewEvents.created_at));

	const items: ReviewEventListItem[] = rows.map((r) => ({
		id: r.id,
		type: r.type,
		rating: r.rating,
		nudge_number: r.nudge_number,
		confidence_score: r.confidence_score !== null ? Number(r.confidence_score) : null,
		created_at: new Date(r.created_at).toISOString()
	}));

	return json({ items });
};
