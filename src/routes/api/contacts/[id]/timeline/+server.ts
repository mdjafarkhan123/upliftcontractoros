import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import {
	fetchTimelineRows,
	TIMELINE_PAGE_SIZE
} from '$lib/server/timeline/buildQuery';
import { mapRowToEntry } from '$lib/server/timeline/registry';
import {
	decodeCursor,
	encodeCursor,
	type RawTimelineRow,
	type TimelineEntry
} from '$lib/server/timeline/types';

/**
 * Contact activity timeline.
 *
 * Server-side flow:
 *   1. union query across all 11+ sources (one branch per discrete event,
 *      so a quote can emit up to 4 rows over its lifecycle)
 *   2. order by (effective_at desc, source_table desc, row_id desc)
 *   3. overfetch TIMELINE_FETCH_LIMIT (+ 1 lookahead in SQL)
 *   4. map each raw row through the timeline registry → TimelineEntry
 *   5. slice to TIMELINE_PAGE_SIZE
 *
 * The client renders icon_key / tone / description / link verbatim.
 * It must NOT re-derive business semantics from the `type` field.
 */
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_view_all_contacts) error(403, 'Forbidden');

	const [exists] = await db
		.select({ id: contacts.id })
		.from(contacts)
		.where(
			and(
				eq(contacts.org_id, auth.orgId),
				eq(contacts.id, event.params.id),
				isNull(contacts.deleted_at)
			)
		)
		.limit(1);
	if (!exists) error(404, 'Contact not found');

	const cursorParam = event.url.searchParams.get('cursor');
	let cursor = null;
	if (cursorParam) {
		cursor = decodeCursor(cursorParam);
		// Malformed cursors must fail loud — silently dropping the cursor would
		// re-serve the first page and produce confusing duplicate entries.
		if (!cursor) error(400, 'Invalid cursor');
	}

	const { rows, hasMore } = await fetchTimelineRows({
		orgId: auth.orgId,
		contactId: event.params.id,
		cursor,
		includePrivateFeedback: auth.member.can_view_negative_feedback === true
	});

	const items: TimelineEntry[] = [];
	let lastRawRow: RawTimelineRow | null = null;
	for (const row of rows) {
		if (items.length >= TIMELINE_PAGE_SIZE) break;
		const entry = mapRowToEntry(row);
		if (!entry) continue;
		items.push(entry);
		lastRawRow = row;
	}

	const filledPage = items.length >= TIMELINE_PAGE_SIZE;
	const next_cursor =
		filledPage && lastRawRow && (hasMore || rows.length > items.length)
			? encodeCursor({
					effective_at: lastRawRow.effective_at.toISOString(),
					source_table: lastRawRow.source_table,
					row_id: lastRawRow.row_id
				})
			: null;

	return json({ items, next_cursor });
};
