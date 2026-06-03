import { json, error } from '@sveltejs/kit';
import { and, eq, desc, lt, or, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { growthFeedItems } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { r2Presign } from '$lib/server/media/r2';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function isFullUrl(value: string): boolean {
	return /^https?:\/\//i.test(value);
}

async function resolveMediaUrl(value: string | null): Promise<string | null> {
	if (!value) return null;
	if (isFullUrl(value)) return value;
	try {
		return await r2Presign(value, 3600);
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!auth.featureFlags.feature_growth_feed) error(403, 'Growth feed is not enabled.');
	if (!auth.member.can_view_growth_feed) error(403, 'Forbidden');

	const url = event.url;
	const rawLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
	const limit = Number.isFinite(rawLimit)
		? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT)
		: DEFAULT_LIMIT;
	const cursor = url.searchParams.get('cursor');

	const conditions: SQL[] = [eq(growthFeedItems.org_id, auth.orgId)];

	if (cursor) {
		// cursor format: "<iso_published_at>|<id>"
		const [publishedAtRaw, id] = cursor.split('|');
		const publishedAt = publishedAtRaw ? new Date(publishedAtRaw) : null;
		if (publishedAt && !Number.isNaN(publishedAt.getTime()) && id) {
			conditions.push(
				or(
					lt(growthFeedItems.published_at, publishedAt),
					and(eq(growthFeedItems.published_at, publishedAt), lt(growthFeedItems.id, id))
				) as SQL
			);
		}
	}

	const rows = await db
		.select({
			id: growthFeedItems.id,
			type: growthFeedItems.type,
			title: growthFeedItems.title,
			body: growthFeedItems.body,
			media_url: growthFeedItems.media_url,
			is_monthly_summary: growthFeedItems.is_monthly_summary,
			published_at: growthFeedItems.published_at
		})
		.from(growthFeedItems)
		.where(and(...conditions))
		.orderBy(desc(growthFeedItems.published_at), desc(growthFeedItems.id))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const page = hasMore ? rows.slice(0, limit) : rows;

	const items = await Promise.all(
		page.map(async (row) => ({
			id: row.id,
			type: row.type,
			title: row.title,
			body: row.body,
			media_url: await resolveMediaUrl(row.media_url),
			is_monthly_summary: row.is_monthly_summary,
			published_at: row.published_at.toISOString()
		}))
	);

	const last = page[page.length - 1];
	const next_cursor = hasMore && last ? `${last.published_at.toISOString()}|${last.id}` : null;

	return json({ data: { items, next_cursor } });
};
