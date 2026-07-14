import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contactAddresses,
	contacts,
	media,
	organizations,
	quoteLineItems,
	quotePackages,
	quotes
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewAnyQuote } from '$lib/server/quotes/permissions';
import { generateAndStoreQuotePdf } from '$lib/server/quotes/pdf';
import { resolveLogoUrl } from '$lib/server/media/resolveLogo';
import { r2Presign } from '$lib/server/media/r2';
import { formatQuoteNumber } from '$lib/server/quotes/format';

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyQuote(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const [row] = await db
		.select({
			quote: quotes,
			contact: contacts,
			org: organizations,
			address: contactAddresses
		})
		.from(quotes)
		.innerJoin(contacts, eq(contacts.id, quotes.contact_id))
		.innerJoin(organizations, eq(organizations.id, quotes.org_id))
		.leftJoin(contactAddresses, eq(contactAddresses.id, quotes.service_address_id))
		.where(and(eq(quotes.id, id), eq(quotes.org_id, auth.orgId), isNull(quotes.deleted_at)))
		.limit(1);
	if (!row) error(404, 'Quote not found');

	const lineRows = await db
		.select({
			line_key: quoteLineItems.line_key,
			description: quoteLineItems.description,
			details: quoteLineItems.details,
			quantity: quoteLineItems.quantity,
			unit: quoteLineItems.unit,
			section_label: quoteLineItems.section_label,
			is_optional: quoteLineItems.is_optional,
			taxable: quoteLineItems.taxable,
			package_id: quoteLineItems.package_id,
			unit_price: quoteLineItems.unit_price,
			total: quoteLineItems.total
		})
		.from(quoteLineItems)
		.where(
			and(
				eq(quoteLineItems.quote_id, id),
				eq(quoteLineItems.org_id, auth.orgId),
				isNull(quoteLineItems.deleted_at)
			)
		)
		.orderBy(asc(quoteLineItems.position), asc(quoteLineItems.created_at));

	// Good-Better-Best tiers (empty on a simple quote) — ordered so the PDF renders them in the
	// contractor's arranged order.
	const packageRows = await db
		.select({
			id: quotePackages.id,
			name: quotePackages.name,
			is_recommended: quotePackages.is_recommended,
			subtotal: quotePackages.subtotal,
			total: quotePackages.total
		})
		.from(quotePackages)
		.where(and(eq(quotePackages.quote_id, id), isNull(quotePackages.deleted_at)))
		.orderBy(asc(quotePackages.position));

	// Per-line photos rendered as small thumbnails under each line. Use the web variant for
	// crisp print; Puppeteer loads the signed URLs (page waits for networkidle0).
	const photoRows = await db
		.select({
			line_key: media.line_key,
			r2_key: media.r2_key,
			web_key: media.web_key
		})
		.from(media)
		.where(
			and(
				eq(media.quote_id, id),
				eq(media.org_id, auth.orgId),
				eq(media.purpose_tag, 'quote_line_item_photo'),
				isNull(media.deleted_at)
			)
		)
		.orderBy(asc(media.created_at));

	const photosByLineKey = new Map<string, { url: string }[]>();
	await Promise.all(
		photoRows.map(async (p) => {
			if (!p.line_key) return;
			const entry = { url: await r2Presign(p.web_key ?? p.r2_key, 3600) };
			const list = photosByLineKey.get(p.line_key);
			if (list) list.push(entry);
			else photosByLineKey.set(p.line_key, [entry]);
		})
	);

	const lineItems = lineRows.map((li) => ({
		...li,
		photos: photosByLineKey.get(li.line_key) ?? []
	}));

	const orgLogoUrl = await resolveLogoUrl(row.org.logo_url);
	const signatureImageUrl = row.org.signature_block_enabled
		? await resolveLogoUrl(row.org.signature_image_url)
		: null;

	// Customer acceptance signature (in-person "sign on this device"): resolve the drawn image's
	// signed URL from its media row so Puppeteer can embed it. Only present when signed in person.
	let acceptanceSignatureUrl: string | null = null;
	if (row.quote.acceptance_signature_media_id) {
		const [sig] = await db
			.select({ r2_key: media.r2_key, web_key: media.web_key })
			.from(media)
			.where(
				and(
					eq(media.id, row.quote.acceptance_signature_media_id),
					eq(media.org_id, auth.orgId),
					eq(media.purpose_tag, 'quote_signature'),
					isNull(media.deleted_at)
				)
			)
			.limit(1);
		if (sig) acceptanceSignatureUrl = await r2Presign(sig.web_key ?? sig.r2_key, 3600);
	}

	// Signed "Accepted by" block: only on an accepted quote that carries a signature (online
	// typed or in-person drawn). Offline "mark approved" captures no signature → no block.
	const acceptance =
		row.quote.status === 'accepted' && row.quote.acceptance_signature_name
			? {
					signerName: row.quote.acceptance_signature_name,
					signedAt:
						row.quote.acceptance_signed_at ?? row.quote.accepted_at ?? row.quote.created_at,
					imageUrl: acceptanceSignatureUrl,
					inPerson: !!row.quote.acceptance_signature_media_id
				}
			: null;

	const { url } = await generateAndStoreQuotePdf({
		org: {
			name: row.org.name,
			address: row.org.address,
			city: row.org.city,
			state: row.org.state,
			zip: row.org.zip,
			twilio_phone_number: row.org.twilio_phone_number,
			logo_url: orgLogoUrl,
			tagline: row.org.tagline,
			primary_color: row.org.primary_color,
			signatureEnabled: row.org.signature_block_enabled,
			signatureName: row.org.signature_name,
			signatureTitle: row.org.signature_title,
			signatureStatement: row.org.signature_statement,
			signatureImageUrl
		},
		quote: {
			id: row.quote.id,
			quote_number_display: formatQuoteNumber(row.quote.quote_number),
			title: row.quote.title,
			subtotal: row.quote.subtotal,
			discount_type: row.quote.discount_type,
			discount_value: row.quote.discount_value,
			discount_amount: row.quote.discount_amount,
			discount_label: row.quote.discount_label,
			tax_rate: row.quote.tax_rate,
			tax_amount: row.quote.tax_amount,
			total: row.quote.total,
			notes: row.quote.notes,
			terms: row.quote.terms,
			deposit_required: row.quote.deposit_required,
			deposit_amount: row.quote.deposit_amount,
			created_at: row.quote.created_at
		},
		contact: {
			full_name: row.contact.full_name,
			email: row.contact.email,
			phone: row.contact.phone
		},
		serviceAddress: row.address
			? {
					address_line_1: row.address.address_line_1,
					address_line_2: row.address.address_line_2,
					city: row.address.city,
					state: row.address.state,
					zip: row.address.zip
				}
			: null,
		lineItems,
		packages: packageRows,
		acceptance
	});

	return json({ data: { url, expires_in: 3600 } });
};
