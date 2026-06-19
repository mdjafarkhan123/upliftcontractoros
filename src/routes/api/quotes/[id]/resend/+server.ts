import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, outboxEvents, quoteChangeRequests, quotes } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendQuote } from '$lib/server/quotes/permissions';
import { generateToken, hashToken } from '$lib/server/quotes/token';
import { formatCurrencyUsd, formatQuoteNumber } from '$lib/server/quotes/format';
import { quoteSentEvent } from '$lib/server/quotes/events';
import { snapshotQuoteVersion } from '$lib/server/quotes/versions';

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
			current_version: number;
		}>(sql`
			SELECT id, status, contact_id, total, quote_number, current_version FROM quotes
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!existing) throw error(404, 'Quote not found');
		if (
			existing.status !== 'sent' &&
			existing.status !== 'viewed' &&
			existing.status !== 'changes_requested'
		) {
			throw error(422, 'Only sent, viewed, or change-requested quotes can be resent');
		}

		const now = new Date();
		const wasChangesRequested = existing.status === 'changes_requested';
		// A re-send out of changes_requested is a real revision → new version.
		// A plain re-delivery of unchanged sent/viewed content keeps the same version.
		const newVersion = wasChangesRequested ? existing.current_version + 1 : existing.current_version;

		await tx
			.update(quotes)
			.set({
				public_token_hash: tokenHash,
				// Re-send returns a change-requested quote to the normal sent lifecycle
				// so existing quote.sent follow-up automation resumes. Reset viewed_at so the
				// new version can register its own "Viewed" + fire a fresh view notification.
				...(wasChangesRequested
					? { status: 'sent' as const, current_version: newVersion, viewed_at: null }
					: {}),
				updated_at: now
			})
			.where(eq(quotes.id, id));

		if (wasChangesRequested) {
			await tx
				.update(quoteChangeRequests)
				.set({ resolved_at: now })
				.where(
					and(
						eq(quoteChangeRequests.quote_id, id),
						eq(quoteChangeRequests.org_id, auth.orgId),
						isNull(quoteChangeRequests.resolved_at)
					)
				);

			// Freeze the revised quote as the new version snapshot.
			await snapshotQuoteVersion(tx, {
				orgId: auth.orgId,
				quoteId: existing.id,
				version: newVersion,
				sentAt: now
			});
		}

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
				isResend: true,
				hasEmail: Boolean(contactRow?.email),
				publicToken: rawToken,
				totalFormatted: formatCurrencyUsd(existing.total),
				quoteNumberDisplay: formatQuoteNumber(existing.quote_number)
			})
		);

		return { id: existing.id };
	});

	return json({
		data: { id: result.id, status: 'sent', is_resend: true }
	});
};
