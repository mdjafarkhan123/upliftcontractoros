import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { media, quotes } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewAnyQuote } from '$lib/server/quotes/permissions';
import { r2Presign } from '$lib/server/media/r2';

// Returns every per-line photo for a quote, each with short-lived signed URLs and its
// owning line_key. The editor groups these by line_key and hands each line its slice.
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyQuote(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const [quote] = await db
		.select({ id: quotes.id })
		.from(quotes)
		.where(and(eq(quotes.id, id), eq(quotes.org_id, auth.orgId), isNull(quotes.deleted_at)))
		.limit(1);
	if (!quote) error(404, 'Quote not found');

	const rows = await db
		.select({
			id: media.id,
			line_key: media.line_key,
			r2_key: media.r2_key,
			thumbnail_key: media.thumbnail_key,
			web_key: media.web_key
		})
		.from(media)
		.where(
			and(
				eq(media.quote_id, id),
				eq(media.org_id, auth.orgId),
				eq(media.purpose_tag, 'quote_line_item_photo'),
				isNull(media.deleted_at)
			)
		)
		.orderBy(asc(media.created_at));

	const data = await Promise.all(
		rows.map(async (r) => ({
			id: r.id,
			line_key: r.line_key,
			thumb_url: await r2Presign(r.thumbnail_key ?? r.r2_key, 3600),
			full_url: await r2Presign(r.web_key ?? r.r2_key, 3600)
		}))
	);

	return json({ data });
};
