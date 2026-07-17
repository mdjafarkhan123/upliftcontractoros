import { json, error } from '@sveltejs/kit';
import { and, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { reviewEvents, reviewRequests } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewReviews } from '$lib/server/reputation/permissions';
import type { FunnelPeriod, FunnelSummary } from '$lib/types/reputation';

const PERIOD_DAYS: Record<FunnelPeriod, number> = { '7d': 7, '30d': 30, '90d': 90 };

function parsePeriod(raw: string | null): FunnelPeriod {
	if (raw === '7d' || raw === '30d' || raw === '90d') return raw;
	return '30d';
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewReviews(auth.member)) error(403, 'Forbidden');

	const period = parsePeriod(event.url.searchParams.get('period'));
	const since = new Date(Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000);

	// All four funnel aggregates are independent reads over the same window — fire them
	// in one wave instead of stacking four round trips.
	const [[sentAgg], [funnelAgg], [convertedAgg], distRows] = await Promise.all([
		// Sent count: source from review_requests.sent_at (the `sent` event is
		// optional per the schema, so we use the column directly).
		db
			.select({ total: sql<number>`count(*)::int` })
			.from(reviewRequests)
			.where(
				and(
					eq(reviewRequests.org_id, auth.orgId),
					isNotNull(reviewRequests.sent_at),
					gte(reviewRequests.sent_at, since),
					isNull(reviewRequests.deleted_at)
				)
			),
		// Funnel steps from review_events. COUNT DISTINCT on review_request_id so a
		// customer opening the link 3 times only counts once at the opened step.
		db
			.select({
				opened: sql<number>`count(distinct ${reviewEvents.review_request_id}) filter (where ${reviewEvents.type} = 'link_opened')::int`,
				rated: sql<number>`count(distinct ${reviewEvents.review_request_id}) filter (where ${reviewEvents.type} = 'rating_submitted')::int`
			})
			.from(reviewEvents)
			.where(and(eq(reviewEvents.org_id, auth.orgId), gte(reviewEvents.created_at, since))),
		// Converted = likely_reviewed in window (anchored to attributed_at).
		db
			.select({ total: sql<number>`count(*)::int` })
			.from(reviewRequests)
			.where(
				and(
					eq(reviewRequests.org_id, auth.orgId),
					eq(reviewRequests.status, 'likely_reviewed'),
					isNotNull(reviewRequests.attributed_at),
					gte(reviewRequests.attributed_at, since),
					isNull(reviewRequests.deleted_at)
				)
			),
		// Star distribution: pull all submitted_rating rows in window and bucket.
		db
			.select({
				rating: reviewRequests.submitted_rating,
				total: sql<number>`count(*)::int`
			})
			.from(reviewRequests)
			.where(
				and(
					eq(reviewRequests.org_id, auth.orgId),
					isNotNull(reviewRequests.submitted_rating),
					isNotNull(reviewRequests.sent_at),
					gte(reviewRequests.sent_at, since),
					isNull(reviewRequests.deleted_at)
				)
			)
			.groupBy(reviewRequests.submitted_rating)
	]);

	const distribution: FunnelSummary['star_distribution'] = {
		'1': 0,
		'2': 0,
		'3': 0,
		'4': 0,
		'5': 0
	};
	for (const r of distRows) {
		if (r.rating === null) continue;
		const key = String(r.rating) as keyof FunnelSummary['star_distribution'];
		if (key in distribution) distribution[key] = r.total;
	}

	const data: FunnelSummary = {
		period,
		sent: sentAgg?.total ?? 0,
		opened: funnelAgg?.opened ?? 0,
		rated: funnelAgg?.rated ?? 0,
		converted: convertedAgg?.total ?? 0,
		star_distribution: distribution
	};

	return json({ data });
};
