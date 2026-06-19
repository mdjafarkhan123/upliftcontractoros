import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { quoteChangeRequests, quoteVersions, quoteViews, quotes } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewAnyQuote } from '$lib/server/quotes/permissions';

type TimelineEvent = {
	type: 'sent' | 'viewed' | 'revision_requested' | 'accepted' | 'declined';
	version: number;
	at: string;
	// 'sent' carries the version's frozen total; 'viewed' carries the per-version view count.
	total?: string;
	view_count?: number;
};

/**
 * Merged, time-ordered history of a quote across all its versions:
 * Sent vN → Viewed vN → Revision requested → Sent v(N+1) → … → Accepted/Declined.
 */
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyQuote(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const [quote] = await db
		.select({
			id: quotes.id,
			status: quotes.status,
			accepted_at: quotes.accepted_at,
			declined_at: quotes.declined_at,
			current_version: quotes.current_version
		})
		.from(quotes)
		.where(and(eq(quotes.id, id), eq(quotes.org_id, auth.orgId), isNull(quotes.deleted_at)))
		.limit(1);

	if (!quote) error(404, 'Quote not found');

	const events: TimelineEvent[] = [];

	// Sent events — one per version snapshot.
	const versions = await db
		.select({
			version: quoteVersions.version,
			total: quoteVersions.total,
			sent_at: quoteVersions.sent_at
		})
		.from(quoteVersions)
		.where(and(eq(quoteVersions.quote_id, id), eq(quoteVersions.org_id, auth.orgId)))
		.orderBy(asc(quoteVersions.version));
	for (const v of versions) {
		events.push({ type: 'sent', version: v.version, at: v.sent_at.toISOString(), total: v.total });
	}

	// Viewed events — first view per version, with that version's total view count.
	const viewsByVersion = await db
		.select({
			version: quoteViews.version,
			first_viewed_at: sql<string>`min(${quoteViews.viewed_at})`,
			view_count: sql<number>`count(*)::int`
		})
		.from(quoteViews)
		.where(and(eq(quoteViews.quote_id, id), eq(quoteViews.org_id, auth.orgId)))
		.groupBy(quoteViews.version);
	for (const v of viewsByVersion) {
		events.push({
			type: 'viewed',
			version: v.version,
			at: new Date(v.first_viewed_at).toISOString(),
			view_count: v.view_count
		});
	}

	// Revision-requested events — one per change request, tagged with the version it was raised against.
	const changeRequests = await db
		.select({
			version: quoteChangeRequests.version,
			requested_at: quoteChangeRequests.requested_at
		})
		.from(quoteChangeRequests)
		.where(and(eq(quoteChangeRequests.quote_id, id), eq(quoteChangeRequests.org_id, auth.orgId)));
	for (const cr of changeRequests) {
		events.push({
			type: 'revision_requested',
			version: cr.version,
			at: cr.requested_at.toISOString()
		});
	}

	// Terminal event — tagged with the version that was live when it closed.
	if (quote.status === 'accepted' && quote.accepted_at) {
		events.push({
			type: 'accepted',
			version: quote.current_version,
			at: quote.accepted_at.toISOString()
		});
	} else if (quote.status === 'declined' && quote.declined_at) {
		events.push({
			type: 'declined',
			version: quote.current_version,
			at: quote.declined_at.toISOString()
		});
	}

	events.sort((a, b) => a.at.localeCompare(b.at));

	return json({ data: { current_version: quote.current_version, events } });
};
