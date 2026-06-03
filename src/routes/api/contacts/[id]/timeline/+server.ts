import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import {
	fetchTimelineRows,
	TIMELINE_PAGE_SIZE,
	TIMELINE_CATEGORIES,
	type TimelineCategory
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

	const [exists] = await db
		.select({ id: contacts.id, assigned_to: contacts.assigned_to })
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
	if (!auth.member.can_view_all_contacts && exists.assigned_to !== auth.member.id) {
		// 404 (not 403) — don't leak existence.
		error(404, 'Contact not found');
	}

	const cursorParam = event.url.searchParams.get('cursor');
	let cursor = null;
	if (cursorParam) {
		cursor = decodeCursor(cursorParam);
		// Malformed cursors must fail loud — silently dropping the cursor would
		// re-serve the first page and produce confusing duplicate entries.
		if (!cursor) error(400, 'Invalid cursor');
	}

	// Free-text filter. Cap length to keep the ILIKE pattern bounded; empty/
	// whitespace-only collapses to no filter.
	const rawSearch = event.url.searchParams.get('q');
	const search = rawSearch ? rawSearch.trim().slice(0, 100) : null;

	const rawTypes = event.url.searchParams.get('types');
	const validSet = new Set<string>(TIMELINE_CATEGORIES);
	const types: TimelineCategory[] | null = rawTypes
		? (rawTypes.split(',').filter((t) => validSet.has(t)) as TimelineCategory[])
		: null;

	const { rows, hasMore } = await fetchTimelineRows({
		orgId: auth.orgId,
		contactId: event.params.id,
		cursor,
		includePrivateFeedback: auth.member.can_view_negative_feedback === true,
		search,
		types: types && types.length > 0 ? types : null
	});

	// The cursor must advance past the last raw row we *consumed*, not the last
	// row that produced a visible entry. Rows whose mapper returns null still
	// occupy a position in the ordering; if we anchored the cursor on the last
	// rendered entry, a null-heavy tail would be re-scanned (or, worse, dropped
	// entirely when a whole window maps to null) on the next page.
	const items: TimelineEntry[] = [];
	let lastConsumedRow: RawTimelineRow | null = null;
	let consumed = 0;
	for (const row of rows) {
		if (items.length >= TIMELINE_PAGE_SIZE) break;
		lastConsumedRow = row;
		consumed++;
		const entry = mapRowToEntry(row);
		if (!entry) continue;
		items.push(entry);
	}

	// More data exists if the union had rows beyond our fetch window (hasMore),
	// or we stopped early on a full page with rows still buffered in this fetch.
	// Either way we emit a cursor so a short page (lots of null-mapped rows) is
	// never mistaken for the end of the timeline.
	const moreToFetch = hasMore || consumed < rows.length;
	const next_cursor =
		moreToFetch && lastConsumedRow
			? encodeCursor({
					effective_at: lastConsumedRow.effective_at.toISOString(),
					source_table: lastConsumedRow.source_table,
					row_id: lastConsumedRow.row_id
				})
			: null;

	return json({ items, next_cursor });
};
