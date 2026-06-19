import { json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { outboxEvents, quotes } from '$lib/server/db/schema';
import { clientIpFrom, lookupQuoteForAction, sha256Hex } from '$lib/server/quotes/publicAccess';
import { rateLimit } from '$lib/server/quotes/rateLimit';
import { quoteDeclinedEvent } from '$lib/server/quotes/events';

// Client-facing decline reasons (PLAN §8). Maps 1:1 onto the pipeline lost-reason
// enum so the linked deal records the same reason when it transitions to Lost.
const declineSchema = z.object({
	reason: z.enum(['price', 'competitor', 'timing', 'scope', 'other']),
	note: z.string().trim().max(2000).optional()
});

function unavailable(): Response {
	return json({ error: 'Quote no longer available' }, { status: 404 });
}

export const POST: RequestHandler = async (event) => {
	const ipHash = sha256Hex(clientIpFrom(event.request));
	const rl = await rateLimit('q.decline', ipHash, 10, 60);
	if (!rl.ok) return json({ error: 'Quote no longer available' }, { status: 429 });

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		body = {};
	}
	const parsed = declineSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Please choose a reason for declining.' }, { status: 422 });
	}
	const { reason, note } = parsed.data;

	const token = event.params.token!;
	const result = await lookupQuoteForAction(token);

	if (!result.ok) {
		if (result.alreadyTerminal === 'declined') {
			return json({ data: { status: 'declined' } });
		}
		return unavailable();
	}

	const quote = result.quote;
	await db.transaction(async (tx) => {
		const [locked] = await tx.execute<{ status: string }>(sql`
			SELECT status FROM quotes WHERE id = ${quote.id} FOR UPDATE
		`);
		if (!locked) return;
		if (locked.status === 'declined') return;
		if (locked.status !== 'sent' && locked.status !== 'viewed') return;

		const now = new Date();
		await tx
			.update(quotes)
			.set({
				status: 'declined',
				declined_at: now,
				decline_reason: reason,
				decline_reason_note: note && note.length > 0 ? note : null,
				updated_at: now
			})
			.where(eq(quotes.id, quote.id));

		await tx
			.insert(outboxEvents)
			.values(quoteDeclinedEvent({ orgId: quote.org_id, quoteId: quote.id }))
			.onConflictDoNothing({ target: outboxEvents.idempotency_key });
	});

	return json({ data: { status: 'declined' } });
};
