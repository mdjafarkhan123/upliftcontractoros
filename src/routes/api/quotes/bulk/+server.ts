import { json, error } from '@sveltejs/kit';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { quotes } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canDeleteQuote } from '$lib/server/quotes/permissions';

// Bulk actions on the quotes list. `delete` soft-deletes each quote (stamps
// `deleted_at`, the recycle-bin model) — the exact per-quote DELETE behavior,
// applied to a selection in one statement. Accepted quotes are signed financial
// records and are excluded from the delete (mirrors the single DELETE guard), so
// the reported count is only the quotes that were actually removable.
const bulkQuoteActionSchema = z.object({
	action: z.literal('delete'),
	ids: z.array(z.string().uuid()).min(1).max(200)
});

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canDeleteQuote(auth.member)) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = bulkQuoteActionSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
	}
	const { ids } = parsed.data;

	const rows = await db
		.update(quotes)
		.set({ deleted_at: new Date(), updated_at: new Date() })
		.where(
			and(
				eq(quotes.org_id, auth.orgId),
				inArray(quotes.id, ids),
				isNull(quotes.deleted_at),
				sql`${quotes.status} <> 'accepted'`
			)
		)
		.returning({ id: quotes.id });

	return json({ data: { deleted: rows.length, ids: rows.map((r) => r.id) } });
};
