import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { quotes } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendQuote } from '$lib/server/quotes/permissions';

// Revive an expired quote by pushing its validity out. This does NOT re-deliver
// the quote to the client (no new token / email) — that's Resend. Extend just
// makes the quote live again so the deal stays workable in Quoted. Status goes
// back to 'sent' (waiting on the client); the prior view history is untouched.
const extendSchema = z.object({
	days: z.union([z.literal(7), z.literal(14), z.literal(30)])
});

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendQuote(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = extendSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: 'Choose 7, 14, or 30 days', field_errors: { days: 'Invalid value' } },
			{ status: 422 }
		);
	}
	const { days } = parsed.data;

	const result = await db.transaction(async (tx) => {
		const [existing] = await tx.execute<{ id: string; status: string }>(sql`
			SELECT id, status FROM quotes
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!existing) throw error(404, 'Quote not found');
		if (existing.status !== 'expired') {
			throw error(422, 'Only expired quotes can be extended');
		}

		const now = new Date();
		const newExpiry = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

		await tx
			.update(quotes)
			.set({ status: 'sent', expires_at: newExpiry, updated_at: now })
			.where(eq(quotes.id, id));

		return { id: existing.id, expires_at: newExpiry.toISOString() };
	});

	return json({ data: { id: result.id, status: 'sent', expires_at: result.expires_at } });
};
