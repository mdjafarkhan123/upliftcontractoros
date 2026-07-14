import { json, error } from '@sveltejs/kit';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { quotes } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canDeleteQuote } from '$lib/server/quotes/permissions';

/**
 * Restore a soft-deleted quote out of the recycle bin.
 *
 * Deleting a quote does not cascade to its children (line items/packages stay
 * attached), so restoring is a single clear of `deleted_at`. Gated to the same
 * permission as deleting a quote.
 */
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canDeleteQuote(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const result = await db
		.update(quotes)
		.set({ deleted_at: null, updated_at: new Date() })
		.where(and(eq(quotes.id, id), eq(quotes.org_id, auth.orgId), isNotNull(quotes.deleted_at)))
		.returning({ id: quotes.id });

	if (result.length === 0) error(404, 'Quote not found');

	return json({ data: { id: result[0].id } });
};
