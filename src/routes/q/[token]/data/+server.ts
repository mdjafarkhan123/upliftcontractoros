import { json } from '@sveltejs/kit';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	media,
	organizations,
	outboxEvents,
	quoteLineItems,
	quoteViews,
	quotes
} from '$lib/server/db/schema';
import { clientIpFrom, lookupValidQuoteByToken, sha256Hex } from '$lib/server/quotes/publicAccess';
import { resolveLogoUrl } from '$lib/server/media/resolveLogo';
import { r2Presign } from '$lib/server/media/r2';
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
					version: quote.current_version,
					ip_hash: ipHash,
					user_agent_hash: uaHash
				})
				.returning({ id: quoteViews.id });

			// viewed_at is null on a freshly (re)sent version — so the first view of each
			// revision flips sent→viewed and fires a version-keyed notification.
			if (!quote.viewed_at) {
				await tx
					.update(quotes)
					.set({ status: 'viewed', viewed_at: new Date(), updated_at: new Date() })
					.where(and(eq(quotes.id, quote.id), eq(quotes.status, 'sent')));

				await tx
					.insert(outboxEvents)
					.values(
						quoteViewedEvent({
							orgId: quote.org_id,
							quoteId: quote.id,
							viewId: view.id,
							version: quote.current_version
						})
					)
					.onConflictDoNothing({ target: outboxEvents.idempotency_key });
			}
		});
	} catch (err) {
		console.error('[quote-view] tracking failed:', err);
	}

	const lineRows = await db
		.select({
			id: quoteLineItems.id,
			line_key: quoteLineItems.line_key,
			description: quoteLineItems.description,
			details: quoteLineItems.details,
			quantity: quoteLineItems.quantity,
			unit: quoteLineItems.unit,
			section_label: quoteLineItems.section_label,
			is_optional: quoteLineItems.is_optional,
			unit_price: quoteLineItems.unit_price,
			total: quoteLineItems.total,
			position: quoteLineItems.position
		})
		.from(quoteLineItems)
		.where(and(eq(quoteLineItems.quote_id, quote.id), sql`${quoteLineItems.deleted_at} IS NULL`))
		.orderBy(quoteLineItems.position);

	// Per-line photos, grouped by line_key, each with a signed thumbnail + full-res URL so the
	// customer sees a thumbnail inline and the high-res image in the lightbox.
	const photoRows = await db
		.select({
			id: media.id,
			line_key: media.line_key,
			r2_key: media.r2_key,
			thumbnail_key: media.thumbnail_key,
			web_key: media.web_key
		})
		.from(media)
		.where(
			and(
				eq(media.quote_id, quote.id),
				eq(media.purpose_tag, 'quote_line_item_photo'),
				sql`${media.deleted_at} IS NULL`
			)
		)
		.orderBy(media.created_at);

	const photosByLineKey = new Map<string, { id: string; thumb_url: string; full_url: string }[]>();
	await Promise.all(
		photoRows.map(async (p) => {
			if (!p.line_key) return;
			const entry = {
				id: p.id,
				thumb_url: await r2Presign(p.thumbnail_key ?? p.r2_key, 3600),
				full_url: await r2Presign(p.web_key ?? p.r2_key, 3600)
			};
			const list = photosByLineKey.get(p.line_key);
			if (list) list.push(entry);
			else photosByLineKey.set(p.line_key, [entry]);
		})
	);

	const lineItems = lineRows.map((li) => ({
		...li,
		photos: photosByLineKey.get(li.line_key) ?? []
	}));

	const [orgRow] = await db
		.select({ stripe_secret_key: organizations.stripe_restricted_key })
		.from(organizations)
		.where(eq(organizations.id, quote.org_id))
		.limit(1);

	const orgLogoUrl = await resolveLogoUrl(quote.org_logo_url);
	// Only resolve/expose the signature when the org has the block enabled.
	const signatureImageUrl = quote.org_signature_block_enabled
		? await resolveLogoUrl(quote.org_signature_image_url)
		: null;

	return json({
		data: {
			quote_number_display: formatQuoteNumber(quote.quote_number),
			title: quote.title,
			status: quote.status,
			subtotal: quote.subtotal,
			discount_type: quote.discount_type,
			discount_value: quote.discount_value,
			discount_amount: quote.discount_amount,
			discount_label: quote.discount_label,
			tax_rate: quote.tax_rate,
			tax_amount: quote.tax_amount,
			total: quote.total,
			deposit_required: quote.deposit_required,
			deposit_type: quote.deposit_type,
			deposit_percent: quote.deposit_percent,
			deposit_amount: quote.deposit_amount,
			deposit_paid_amount: quote.deposit_paid_amount,
			deposit_paid_at: quote.deposit_paid_at?.toISOString() ?? null,
			deposit_payment_available: Boolean(orgRow?.stripe_secret_key),
			notes: quote.notes,
			expires_at: quote.expires_at?.toISOString() ?? null,
			org_name: quote.org_name,
			org_logo_url: orgLogoUrl,
			org_primary_color: quote.org_primary_color,
			org_tagline: quote.org_tagline,
			signature_block_enabled: quote.org_signature_block_enabled,
			signature_name: quote.org_signature_block_enabled ? quote.org_signature_name : null,
			signature_title: quote.org_signature_block_enabled ? quote.org_signature_title : null,
			signature_statement: quote.org_signature_block_enabled ? quote.org_signature_statement : null,
			signature_image_url: signatureImageUrl,
			contact_name: quote.contact_name,
			issued_by_name: quote.issued_by_name,
			service_address: quote.service_address,
			line_items: lineItems
		}
	});
};
