import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, outboxEvents, quoteLineItems, quotes } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendQuote } from '$lib/server/quotes/permissions';
import { generateToken, hashToken } from '$lib/server/quotes/token';
import { formatCurrencyUsd, formatQuoteNumber } from '$lib/server/quotes/format';
import { quoteSentEvent } from '$lib/server/quotes/events';
import { snapshotQuoteVersion } from '$lib/server/quotes/versions';

const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendQuote(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const rawToken = generateToken();
	const tokenHash = hashToken(rawToken);

	const result = await db.transaction(async (tx) => {
		const [existing] = await tx.execute<{
			id: string;
			status: string;
			contact_id: string;
			total: string;
			quote_number: number;
		}>(sql`
			SELECT id, status, contact_id, total, quote_number FROM quotes
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!existing) throw error(404, 'Quote not found');
		if (existing.status !== 'draft') {
			throw error(422, 'Only draft quotes can be sent');
		}

		const [lineCount] = await tx.execute<{ c: number }>(sql`
			SELECT COUNT(*)::int AS c FROM quote_line_items
			WHERE quote_id = ${id} AND deleted_at IS NULL
		`);
		if (!lineCount || lineCount.c === 0) {
			throw error(422, 'Add at least one line item before sending');
		}

		const sentAt = new Date();
		const expiresAt = new Date(sentAt.getTime() + THIRTY_DAYS_MS);

		await tx
			.update(quotes)
			.set({
				status: 'sent',
				public_token_hash: tokenHash,
				sent_at: sentAt,
				expires_at: expiresAt,
				updated_at: sentAt
			})
			.where(eq(quotes.id, id));

		// Freeze v1 — the first send. current_version stays at its default of 1.
		await snapshotQuoteVersion(tx, {
			orgId: auth.orgId,
			quoteId: existing.id,
			version: 1,
			sentAt
		});

		const [contactRow] = await tx
			.select({ email: contacts.email })
			.from(contacts)
			.where(eq(contacts.id, existing.contact_id))
			.limit(1);

		await tx.insert(outboxEvents).values(
			quoteSentEvent({
				orgId: auth.orgId,
				quoteId: existing.id,
				contactId: existing.contact_id,
				isResend: false,
				hasEmail: Boolean(contactRow?.email),
				publicToken: rawToken,
				totalFormatted: formatCurrencyUsd(existing.total),
				quoteNumberDisplay: formatQuoteNumber(existing.quote_number)
			})
		);

		return { id: existing.id, sentAt, expiresAt };
	});

	return json({
		data: {
			id: result.id,
			status: 'sent',
			sent_at: result.sentAt.toISOString(),
			expires_at: result.expiresAt.toISOString()
		}
	});
};
