import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { outboxEvents, quotes } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditQuote } from '$lib/server/quotes/permissions';
import { quoteDeclinedEvent } from '$lib/server/quotes/events';

// Record an OFFLINE decline — the customer said no by phone/in person. Mirrors the public
// decline route (same reason enum, which maps 1:1 onto the pipeline lost-reason so the
// linked deal records the same reason when it moves to Lost).
const schema = z.object({
	reason: z.enum(['price', 'competitor', 'timing', 'scope', 'other']),
	note: z.string().trim().max(2000).optional()
});

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canEditQuote(auth.member)) error(403, 'Forbidden');

	const quoteId = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		body = {};
	}
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Please choose a reason for declining.' }, { status: 422 });
	}
	const { reason, note } = parsed.data;

	const result = await db.transaction(async (tx) => {
		const [locked] = await tx.execute<{ id: string; org_id: string; status: string }>(sql`
			SELECT id, org_id, status FROM quotes
			WHERE id = ${quoteId} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!locked) throw error(404, 'Quote not found');
		if (locked.status === 'declined') return { status: 'declined' as const, alreadyDone: true };
		if (
			locked.status !== 'sent' &&
			locked.status !== 'viewed' &&
			locked.status !== 'changes_requested'
		) {
			throw error(422, 'Only a sent quote can be marked declined');
		}

		const now = new Date();
		await tx
			.update(quotes)
			.set({
				status: 'declined',
				declined_at: now,
				decline_reason: reason,
				decline_reason_note: note && note.length > 0 ? note : null,
				offline_marked_by: auth.member.id,
				updated_at: now
			})
			.where(eq(quotes.id, quoteId));

		await tx
			.insert(outboxEvents)
			.values(quoteDeclinedEvent({ orgId: locked.org_id, quoteId }))
			.onConflictDoNothing({ target: outboxEvents.idempotency_key });

		return { status: 'declined' as const, alreadyDone: false };
	});

	return json({ data: result });
};
