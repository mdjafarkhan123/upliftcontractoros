import { json, error } from '@sveltejs/kit';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { privateFeedback, reviewRequests, reviews } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import {
	canViewNegativeFeedback,
	canViewReviews
} from '$lib/server/reputation/permissions';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewReviews(auth.member)) error(403, 'Forbidden');

	const monthStart = new Date();
	monthStart.setDate(1);
	monthStart.setHours(0, 0, 0, 0);

	const [reviewAgg] = await db
		.select({
			total: sql<number>`count(*)::int`,
			avg: sql<number | null>`avg(${reviews.score})::float`
		})
		.from(reviews)
		.where(eq(reviews.org_id, auth.orgId));

	const [monthAgg] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(reviews)
		.where(and(eq(reviews.org_id, auth.orgId), gte(reviews.created_at, monthStart)));

	const [pendingAgg] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(reviewRequests)
		.where(
			and(
				eq(reviewRequests.org_id, auth.orgId),
				eq(reviewRequests.status, 'sent'),
				isNull(reviewRequests.deleted_at)
			)
		);

	let negativeCount: number | null = null;
	if (canViewNegativeFeedback(auth.member)) {
		const [negAgg] = await db
			.select({ total: sql<number>`count(*)::int` })
			.from(privateFeedback)
			.where(
				and(
					eq(privateFeedback.org_id, auth.orgId),
					eq(privateFeedback.is_resolved, false),
					isNull(privateFeedback.deleted_at)
				)
			);
		negativeCount = negAgg?.total ?? 0;
	}

	return json({
		data: {
			total_reviews: reviewAgg?.total ?? 0,
			avg_score: reviewAgg?.avg ?? null,
			reviews_this_month: monthAgg?.total ?? 0,
			pending_requests: pendingAgg?.total ?? 0,
			negative_count: negativeCount
		}
	});
};
