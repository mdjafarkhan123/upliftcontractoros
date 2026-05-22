import { json } from '@sveltejs/kit';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	organizations,
	outboxEvents,
	quoteLineItems,
	quoteViews,
	quotes
} from '$lib/server/db/schema';
import {
	clientIpFrom,
	lookupValidQuoteByToken,
	sha256Hex
} from '$lib/server/quotes/publicAccess';
import { rateLimit } from '$lib/server/quotes/rateLimit';
import { formatQuoteNumber } from '$lib/server/quotes/format';
import { quoteViewedEvent } from '$lib/server/quotes/events';

const VIEW_DEDUP_SECONDS = 60;

function unavailable(): Response {
	return json({ error: 'Quote no longer available' }, { status: 404 });
}

export const GET: RequestHandler = async (event) => {
	const ipHash = sha256Hex(clientIpFrom(event.request));
	const rl = await rateLimit('q.view', ipHash, 60, 60);
	if (!rl.ok) {
		return json({ error: 'Quote no longer available' }, { status: 429 });
	}

	const token = event.params.token!;
	const result = await lookupValidQuoteByToken(token);
	if (!result.ok) return unavailable();
	const quote = result.quote;

	const ua = event.request.headers.get('user-agent') ?? '';
	const uaHash = sha256Hex(ua);

	try {
		await db.transaction(async (tx) => {
			const cutoff = new Date(Date.now() - VIEW_DEDUP_SECONDS * 1000);
			const [recent] = await tx
				.select({ id: quoteViews.id })
				.from(quoteViews)
				.where(
					and(
						eq(quoteViews.quote_id, quote.id),
						eq(quoteViews.ip_hash, ipHash),
						gte(quoteViews.viewed_at, cutoff)
					)
				)
				.limit(1);
			if (recent) return;

			const [view] = await tx
				.insert(quoteViews)
				.values({
					org_id: quote.org_id,
					quote_id: quote.id,
					ip_hash: ipHash,
					user_agent_hash: uaHash
				})
				.returning({ id: quoteViews.id });

			if (!quote.viewed_at) {
				await tx
					.update(quotes)
					.set({ status: 'viewed', viewed_at: new Date(), updated_at: new Date() })
					.where(and(eq(quotes.id, quote.id), eq(quotes.status, 'sent')));

				await tx
					.insert(outboxEvents)
					.values(
						quoteViewedEvent({ orgId: quote.org_id, quoteId: quote.id, viewId: view.id })
					)
					.onConflictDoNothing({ target: outboxEvents.idempotency_key });
			}
		});
	} catch (err) {
		console.error('[quote-view] tracking failed:', err);
	}

	const lineItems = await db
		.select({
			id: quoteLineItems.id,
			description: quoteLineItems.description,
			quantity: quoteLineItems.quantity,
			unit_price: quoteLineItems.unit_price,
			total: quoteLineItems.total,
			position: quoteLineItems.position
		})
		.from(quoteLineItems)
		.where(
			and(
				eq(quoteLineItems.quote_id, quote.id),
				sql`${quoteLineItems.deleted_at} IS NULL`
			)
		)
		.orderBy(quoteLineItems.position);

	const [orgRow] = await db
		.select({ stripe_secret_key: organizations.stripe_restricted_key })
		.from(organizations)
		.where(eq(organizations.id, quote.org_id))
		.limit(1);

	return json({
		data: {
			quote_number_display: formatQuoteNumber(quote.quote_number),
			title: quote.title,
			status: quote.status,
			subtotal: quote.subtotal,
			tax_rate: quote.tax_rate,
			tax_amount: quote.tax_amount,
			total: quote.total,
			deposit_required: quote.deposit_required,
			deposit_amount: quote.deposit_amount,
			deposit_paid_amount: quote.deposit_paid_amount,
			deposit_paid_at: quote.deposit_paid_at?.toISOString() ?? null,
			deposit_payment_available: Boolean(orgRow?.stripe_secret_key),
			notes: quote.notes,
			expires_at: quote.expires_at?.toISOString() ?? null,
			org_name: quote.org_name,
			contact_name: quote.contact_name,
			line_items: lineItems
		}
	});
};
