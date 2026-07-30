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
import { sendQuoteSchema } from '$lib/server/quotes/schemas';
import { canContactReceiveCommunication } from '$lib/server/communication-preferences';

const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendQuote(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	// Parse the optional channel/copy override. A bodyless POST (legacy) keeps the
	// old behaviour: deliver on every available channel with the default copy.
	let send: import('$lib/server/quotes/schemas').SendQuoteInput | null = null;
	try {
		const raw = await event.request.json();
		const parsed = sendQuoteSchema.safeParse(raw);
		if (!parsed.success) {
			const fieldErrors: Record<string, string> = {};
			for (const issue of parsed.error.issues) {
				const key = issue.path[0];
				if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
			}
			return json(
				{ error: 'Please fix the highlighted fields', field_errors: fieldErrors },
				{ status: 422 }
			);
		}
		send = parsed.data;
	} catch {
		send = null;
	}

	// Pre-validate that the chosen channels are actually deliverable for this contact
	// (clean field-error response). The authoritative send happens in the tx below;
	// the worker also hard-blocks SMS on opt-out as a final safety net.
	if (send) {
		const [reach] = await db.execute<{ contact_id: string }>(sql`
			SELECT q.contact_id
			FROM quotes q JOIN contacts c ON c.id = q.contact_id
			WHERE q.id = ${id} AND q.org_id = ${auth.orgId} AND q.deleted_at IS NULL
		`);
		if (reach) {
			const results = await Promise.all(
				send.channels.map((channel) =>
					canContactReceiveCommunication({
						orgId: auth.orgId,
						contactId: reach.contact_id,
						channel,
						direction: 'outbound',
						category: 'quote_send'
					})
				)
			);
			const blocked = results.find((result) => !result.allowed);
			if (blocked)
				return json(
					{
						error: blocked.reasonMessage ?? 'This communication is blocked.',
						field_errors: { channels: blocked.reasonMessage ?? 'Channel unavailable' }
					},
					{ status: 422 }
				);
		}
	}

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
				public_token: rawToken,
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
				quoteNumberDisplay: formatQuoteNumber(existing.quote_number),
				channels: send?.channels ?? null,
				smsBody: send?.sms_body ?? null,
				emailSubject: send?.email_subject ?? null,
				emailBody: send?.email_body ?? null
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
