import { json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { outboxEvents, quotes } from '$lib/server/db/schema';
import { clientIpFrom, lookupQuoteForAction, sha256Hex } from '$lib/server/quotes/publicAccess';
import { rateLimit } from '$lib/server/quotes/rateLimit';
import { quoteAcceptedEvent } from '$lib/server/quotes/events';

function unavailable(): Response {
	return json({ error: 'Quote no longer available' }, { status: 404 });
}

export const POST: RequestHandler = async (event) => {
	const ipHash = sha256Hex(clientIpFrom(event.request));
	const rl = await rateLimit('q.accept', ipHash, 10, 60);
	if (!rl.ok) return json({ error: 'Quote no longer available' }, { status: 429 });

	const token = event.params.token!;
	const result = await lookupQuoteForAction(token);

	if (!result.ok) {
		if (result.alreadyTerminal === 'accepted') {
			return json({ data: { status: 'accepted' } });
		}
		return unavailable();
	}

	const quote = result.quote;
	await db.transaction(async (tx) => {
		const [locked] = await tx.execute<{ status: string }>(sql`
			SELECT status FROM quotes WHERE id = ${quote.id} FOR UPDATE
		`);
		if (!locked) return;
		if (locked.status === 'accepted') return;
		if (locked.status !== 'sent' && locked.status !== 'viewed') return;

		const now = new Date();
		await tx
			.update(quotes)
			.set({ status: 'accepted', accepted_at: now, updated_at: now })
			.where(eq(quotes.id, quote.id));

		await tx
			.insert(outboxEvents)
			.values(quoteAcceptedEvent({ orgId: quote.org_id, quoteId: quote.id }))
			.onConflictDoNothing({ target: outboxEvents.idempotency_key });
	});

	return json({ data: { status: 'accepted' } });
};
