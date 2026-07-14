import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db/client';
import { quotes } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendQuote } from '$lib/server/quotes/permissions';
import { generateToken, hashToken } from '$lib/server/quotes/token';
import { snapshotQuoteVersion } from '$lib/server/quotes/versions';

const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

/**
 * Returns the customer-facing public link for a quote so the contractor can copy /
 * paste it anywhere (WhatsApp, iMessage, in person). This is the "Copy link" action —
 * the same link the client would receive by email/SMS, so no rotation happens for an
 * already-live quote.
 *
 * Sharing a *draft* mints the token and moves the quote out of Draft (Jobber /
 * Housecall behaviour) so the pasted link actually opens — but it deliberately does
 * NOT emit a quote.sent outbox event, so no automated client follow-ups fire (the
 * contractor is delivering it by hand). A later Send / Resend handles delivery +
 * automation as usual.
 */
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendQuote(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const token = await db.transaction(async (tx) => {
		const [existing] = await tx.execute<{
			id: string;
			status: string;
			public_token: string | null;
		}>(sql`
			SELECT id, status, public_token FROM quotes
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!existing) throw error(404, 'Quote not found');

		if (existing.status === 'declined' || existing.status === 'expired') {
			throw error(422, 'This quote is no longer active — extend or resend it first');
		}

		// Already live and already carries a plaintext token → hand back the same link.
		if (existing.status !== 'draft' && existing.public_token) {
			return existing.public_token;
		}

		// Need to mint a token. Same guard as /send: never make an empty quote viewable.
		const [lineCount] = await tx.execute<{ c: number }>(sql`
			SELECT COUNT(*)::int AS c FROM quote_line_items
			WHERE quote_id = ${id} AND deleted_at IS NULL
		`);
		if (!lineCount || lineCount.c === 0) {
			throw error(422, 'Add at least one line item before sharing');
		}

		const rawToken = generateToken();
		const tokenHash = hashToken(rawToken);
		const now = new Date();

		if (existing.status === 'draft') {
			const expiresAt = new Date(now.getTime() + THIRTY_DAYS_MS);
			await tx
				.update(quotes)
				.set({
					status: 'sent',
					public_token_hash: tokenHash,
					public_token: rawToken,
					sent_at: now,
					expires_at: expiresAt,
					updated_at: now
				})
				.where(eq(quotes.id, id));
			// Freeze v1 — the first time this quote becomes viewable.
			await snapshotQuoteVersion(tx, {
				orgId: auth.orgId,
				quoteId: id,
				version: 1,
				sentAt: now
			});
		} else {
			// Legacy sent/viewed/accepted quote created before the public_token column
			// existed: backfill a token so it can be copied. This rotates the hash, so a
			// link the client received before this change stops working — rare one-off.
			await tx
				.update(quotes)
				.set({ public_token_hash: tokenHash, public_token: rawToken, updated_at: now })
				.where(eq(quotes.id, id));
		}

		return rawToken;
	});

	const base = (env.APP_URL ?? event.url.origin).replace(/\/$/, '');
	return json({ data: { url: `${base}/q/${token}` } });
};
