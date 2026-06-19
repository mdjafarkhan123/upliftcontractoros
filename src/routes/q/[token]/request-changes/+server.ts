import { json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { outboxEvents, quoteChangeRequests, quotes } from '$lib/server/db/schema';
import { clientIpFrom, sha256Hex } from '$lib/server/quotes/publicAccess';
import { hashToken, constantTimeEqualHex } from '$lib/server/quotes/token';
import { rateLimit } from '$lib/server/quotes/rateLimit';
import { quoteChangesRequestedEvent } from '$lib/server/quotes/events';
import { sanitizePlainText, CHANGE_REQUEST_MAX_LENGTH } from '$lib/server/quotes/sanitize';
import { formatQuoteNumber } from '$lib/server/quotes/format';

function unavailable(): Response {
	return json({ error: 'Quote no longer available' }, { status: 404 });
}

export const POST: RequestHandler = async (event) => {
	const ipHash = sha256Hex(clientIpFrom(event.request));
	const rl = await rateLimit('q.request_changes', ipHash, 10, 60);
	if (!rl.ok) return json({ error: 'Quote no longer available' }, { status: 429 });

	const token = event.params.token!;
	if (!token || token.length < 16) return unavailable();

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const rawMessage =
		body &&
		typeof body === 'object' &&
		'message' in body &&
		typeof (body as { message: unknown }).message === 'string'
			? (body as { message: string }).message
			: '';
	const clean = sanitizePlainText(rawMessage);
	if (!clean) {
		return json(
			{
				error: 'Please tell us what you would like to change',
				field_errors: { message: 'Required' }
			},
			{ status: 422 }
		);
	}
	if (clean.length > CHANGE_REQUEST_MAX_LENGTH) {
		return json(
			{
				error: `Message must be ${CHANGE_REQUEST_MAX_LENGTH} characters or fewer`,
				field_errors: { message: 'Too long' }
			},
			{ status: 422 }
		);
	}

	const tokenHash = hashToken(token);

	const result = await db.transaction(async (tx) => {
		const [row] = await tx.execute<{
			id: string;
			org_id: string;
			status: string;
			quote_number: number;
			current_version: number;
			stored_hash: string;
			deleted_at: Date | null;
			expires_at: Date | null;
		}>(sql`
			SELECT id, org_id, status, quote_number, current_version,
				public_token_hash AS stored_hash, deleted_at, expires_at
			FROM quotes WHERE public_token_hash = ${tokenHash}
			FOR UPDATE
		`);
		if (!row) return { kind: 'unavailable' as const };
		if (!constantTimeEqualHex(row.stored_hash, tokenHash)) return { kind: 'unavailable' as const };
		if (row.deleted_at) return { kind: 'unavailable' as const };
		if (row.expires_at && row.expires_at.getTime() < Date.now())
			return { kind: 'unavailable' as const };

		// Idempotent: already in changes_requested — return success without re-emitting.
		if (row.status === 'changes_requested') return { kind: 'already' as const };
		if (row.status !== 'sent' && row.status !== 'viewed') return { kind: 'unavailable' as const };

		const now = new Date();
		const [inserted] = await tx
			.insert(quoteChangeRequests)
			.values({
				org_id: row.org_id,
				quote_id: row.id,
				version: row.current_version,
				message: clean,
				requested_at: now
			})
			.returning({ id: quoteChangeRequests.id });

		await tx
			.update(quotes)
			.set({ status: 'changes_requested', updated_at: now })
			.where(eq(quotes.id, row.id));

		const preview = clean.length > 120 ? clean.slice(0, 119).trimEnd() + '…' : clean;

		await tx
			.insert(outboxEvents)
			.values(
				quoteChangesRequestedEvent({
					orgId: row.org_id,
					quoteId: row.id,
					changeRequestId: inserted.id,
					messagePreview: preview,
					quoteNumberDisplay: formatQuoteNumber(row.quote_number)
				})
			)
			.onConflictDoNothing({ target: outboxEvents.idempotency_key });

		return { kind: 'created' as const };
	});

	if (result.kind === 'unavailable') return unavailable();
	return json({ data: { status: 'changes_requested' } });
};
