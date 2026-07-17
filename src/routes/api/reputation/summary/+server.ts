import { json, error } from '@sveltejs/kit';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations, privateFeedback, reviewRequests, reviews } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewNegativeFeedback, canViewReviews } from '$lib/server/reputation/permissions';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewReviews(auth.member)) error(403, 'Forbidden');

	const monthStart = new Date();
	monthStart.setDate(1);
	monthStart.setHours(0, 0, 0, 0);

	// All five aggregates are independent reads — fire them in one wave instead of
	// stacking round trips. The negative-feedback count is permission-gated: it joins
	// the batch only when allowed, otherwise resolves to null (Rule: cond ? q : fallback).
	const showNegative = canViewNegativeFeedback(auth.member);
	const [[reviewAgg], [monthAgg], [pendingAgg], [org], negAggRow] = await Promise.all([
		db
			.select({
				total: sql<number>`count(*)::int`,
				avg: sql<number | null>`avg(${reviews.score})::float`
			})
			.from(reviews)
			.where(eq(reviews.org_id, auth.orgId)),
		db
			.select({ total: sql<number>`count(*)::int` })
			.from(reviews)
			.where(and(eq(reviews.org_id, auth.orgId), gte(reviews.created_at, monthStart))),
		// Pending = sent but token not yet expired. Mirrors the lazy-expiry rule
		// applied in /api/review-requests so the count and the list agree.
		db
			.select({ total: sql<number>`count(*)::int` })
			.from(reviewRequests)
			.where(
				and(
					eq(reviewRequests.org_id, auth.orgId),
					eq(reviewRequests.status, 'sent'),
					isNull(reviewRequests.deleted_at),
					sql`(${reviewRequests.token_expires_at} IS NULL OR ${reviewRequests.token_expires_at} > now())`
				)
			),
		db
			.select({
				last_known_review_count: organizations.last_known_review_count,
				last_review_check_at: organizations.last_review_check_at
			})
			.from(organizations)
			.where(eq(organizations.id, auth.orgId))
			.limit(1),
		showNegative
			? db
					.select({ total: sql<number>`count(*)::int` })
					.from(privateFeedback)
					.where(
						and(
							eq(privateFeedback.org_id, auth.orgId),
							eq(privateFeedback.is_resolved, false),
							isNull(privateFeedback.deleted_at)
						)
					)
			: Promise.resolve([])
	]);

	const negativeCount: number | null = showNegative ? (negAggRow[0]?.total ?? 0) : null;

	return json({
		data: {
			total_reviews: reviewAgg?.total ?? 0,
			avg_score: reviewAgg?.avg ?? null,
			reviews_this_month: monthAgg?.total ?? 0,
			pending_requests: pendingAgg?.total ?? 0,
			negative_count: negativeCount,
			last_known_review_count: org?.last_known_review_count ?? null,
			last_review_check_at: org?.last_review_check_at
				? new Date(org.last_review_check_at).toISOString()
				: null
		}
	});
};
