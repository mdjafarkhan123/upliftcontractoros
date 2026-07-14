import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobs } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewJob } from '$lib/server/jobs/permissions';
import {
	fetchJobTimelineRows,
	JOB_TIMELINE_CATEGORIES,
	type JobTimelineCategory
} from '$lib/server/timeline/buildJobQuery';
import { TIMELINE_PAGE_SIZE } from '$lib/server/timeline/buildQuery';
import { mapRowToEntry } from '$lib/server/timeline/registry';
import {
	decodeCursor,
	encodeCursor,
	type RawTimelineRow,
	type TimelineEntry
} from '$lib/server/timeline/types';

/**
 * Job activity timeline (Jobber "Activity feed").
 *
 * Same server flow as the contact timeline: union across job-scoped sources,
 * order by (effective_at desc, source_table desc, row_id desc), overfetch,
 * map each raw row through the shared registry, slice to a page, emit a cursor
 * anchored on the last CONSUMED row (not the last rendered one) so null-mapped
 * rows never shrink a page or get re-scanned.
 */
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id!;

	// Existence + tenant scope. Assigned-only techs may view a job's timeline only
	// when it's their job — mirror canViewJob so we never leak another tech's work.
	const [job] = await db
		.select({ id: jobs.id, assigned_to: jobs.assigned_to })
		.from(jobs)
		.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!job) error(404, 'Job not found');
	if (!canViewJob(auth.member, { assigned_to: job.assigned_to })) {
		// 404 (not 403) — don't leak existence to a tech who can't see it.
		error(404, 'Job not found');
	}

	const cursorParam = event.url.searchParams.get('cursor');
	let cursor = null;
	if (cursorParam) {
		cursor = decodeCursor(cursorParam);
		// Malformed cursors must fail loud — silently dropping the cursor would
		// re-serve the first page and produce confusing duplicate entries.
		if (!cursor) error(400, 'Invalid cursor');
	}

	const rawSearch = event.url.searchParams.get('q');
	const search = rawSearch ? rawSearch.trim().slice(0, 100) : null;

	const rawTypes = event.url.searchParams.get('types');
	const validSet = new Set<string>(JOB_TIMELINE_CATEGORIES);
	const types: JobTimelineCategory[] | null = rawTypes
		? (rawTypes.split(',').filter((t) => validSet.has(t)) as JobTimelineCategory[])
		: null;

	const { rows, hasMore } = await fetchJobTimelineRows({
		orgId: auth.orgId,
		jobId: id,
		cursor,
		includePrivateFeedback: auth.member.can_view_negative_feedback === true,
		search,
		types: types && types.length > 0 ? types : null
	});

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
