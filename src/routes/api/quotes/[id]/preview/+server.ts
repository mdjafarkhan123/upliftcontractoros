import { json, error } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contactAddresses,
	contacts,
	media,
	orgMembers,
	organizations,
	quoteLineItems,
	quotePackages,
	quotes
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewAnyQuote } from '$lib/server/quotes/permissions';
import { formatQuoteNumber } from '$lib/server/quotes/format';
import { resolveLogoUrl } from '$lib/server/media/resolveLogo';
import { r2Presign } from '$lib/server/media/r2';

/**
 * Contractor-facing "Preview as client" feed. Returns the SAME payload shape the public
 * client page (/q/[token]/data) renders, so QuoteDocumentView shows exactly what the
 * customer will see — but with three deliberate differences:
 *   1. Authenticated (org member, can_view_all_quotes) instead of a public token.
 *   2. NO side effects — never tracks a view, flips sent→viewed, or emits notifications.
 *   3. Works for ANY status, including draft, so a quote can be previewed before it's sent.
 */
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyQuote(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;
	const [row] = await db
		.select({
			id: quotes.id,
			org_id: quotes.org_id,
			quote_number: quotes.quote_number,
			title: quotes.title,
			status: quotes.status,
			subtotal: quotes.subtotal,
			discount_type: quotes.discount_type,
			discount_value: quotes.discount_value,
			discount_amount: quotes.discount_amount,
			discount_label: quotes.discount_label,
			tax_rate: quotes.tax_rate,
			tax_amount: quotes.tax_amount,
			total: quotes.total,
			deposit_required: quotes.deposit_required,
			deposit_type: quotes.deposit_type,
			deposit_percent: quotes.deposit_percent,
			deposit_amount: quotes.deposit_amount,
			deposit_paid_amount: quotes.deposit_paid_amount,
			deposit_paid_at: quotes.deposit_paid_at,
			accepted_package_id: quotes.accepted_package_id,
			accepted_total: quotes.accepted_total,
			notes: quotes.notes,
			terms: quotes.terms,
			expires_at: quotes.expires_at,
			contact_name: contacts.full_name,
			org_name: organizations.name,
			org_logo_url: organizations.logo_url,
			org_primary_color: organizations.primary_color,
			org_tagline: organizations.tagline,
			org_signature_block_enabled: organizations.signature_block_enabled,
			org_signature_name: organizations.signature_name,
			org_signature_title: organizations.signature_title,
			org_signature_statement: organizations.signature_statement,
			org_signature_image_url: organizations.signature_image_url,
			org_stripe_key: organizations.stripe_restricted_key,
			issued_by_name: orgMembers.full_name,
			service_address_id: quotes.service_address_id,
			addr_label: contactAddresses.label,
			addr_line_1: contactAddresses.address_line_1,
			addr_line_2: contactAddresses.address_line_2,
			addr_city: contactAddresses.city,
			addr_state: contactAddresses.state,
			addr_zip: contactAddresses.zip,
			deleted_at: quotes.deleted_at
		})
		.from(quotes)
		.innerJoin(contacts, eq(contacts.id, quotes.contact_id))
		.innerJoin(organizations, eq(organizations.id, quotes.org_id))
		.leftJoin(orgMembers, eq(orgMembers.id, quotes.issued_by))
		.leftJoin(contactAddresses, eq(contactAddresses.id, quotes.service_address_id))
		.where(and(eq(quotes.id, id), eq(quotes.org_id, auth.orgId)))
		.limit(1);

	if (!row || row.deleted_at) error(404, 'Not found');

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
			taxable: quoteLineItems.taxable,
			package_id: quoteLineItems.package_id,
			unit_price: quoteLineItems.unit_price,
			total: quoteLineItems.total,
			position: quoteLineItems.position
		})
		.from(quoteLineItems)
		.where(and(eq(quoteLineItems.quote_id, row.id), sql`${quoteLineItems.deleted_at} IS NULL`))
		.orderBy(quoteLineItems.position);

	// Good-Better-Best tiers (empty on a simple quote) — so the contractor preview matches
	// the customer's side-by-side view exactly.
	const packages = await db
		.select({
			id: quotePackages.id,
			package_key: quotePackages.package_key,
			name: quotePackages.name,
			is_recommended: quotePackages.is_recommended,
			position: quotePackages.position,
			subtotal: quotePackages.subtotal,
			total: quotePackages.total
		})
		.from(quotePackages)
		.where(and(eq(quotePackages.quote_id, row.id), sql`${quotePackages.deleted_at} IS NULL`))
		.orderBy(quotePackages.position);

	// Per-line photos, grouped by line_key, each with a signed thumbnail + full-res URL.
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
				eq(media.quote_id, row.id),
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
		photos: li.line_key ? (photosByLineKey.get(li.line_key) ?? []) : []
	}));

	const orgLogoUrl = await resolveLogoUrl(row.org_logo_url);
	const signatureImageUrl = row.org_signature_block_enabled
		? await resolveLogoUrl(row.org_signature_image_url)
		: null;

	return json({
		data: {
			quote_number_display: formatQuoteNumber(row.quote_number),
			title: row.title,
			status: row.status,
			subtotal: row.subtotal,
			discount_type: row.discount_type,
			discount_value: row.discount_value,
			discount_amount: row.discount_amount,
			discount_label: row.discount_label,
			tax_rate: row.tax_rate,
			tax_amount: row.tax_amount,
			total: row.total,
			deposit_required: row.deposit_required,
			deposit_type: row.deposit_type,
			deposit_percent: row.deposit_percent,
			deposit_amount: row.deposit_amount,
			deposit_paid_amount: row.deposit_paid_amount,
			deposit_paid_at: row.deposit_paid_at?.toISOString() ?? null,
			deposit_payment_available: Boolean(row.org_stripe_key),
			notes: row.notes,
			terms: row.terms,
			expires_at: row.expires_at?.toISOString() ?? null,
			org_name: row.org_name,
			org_logo_url: orgLogoUrl,
			org_primary_color: row.org_primary_color,
			org_tagline: row.org_tagline,
			signature_block_enabled: row.org_signature_block_enabled,
			signature_name: row.org_signature_block_enabled ? row.org_signature_name : null,
			signature_title: row.org_signature_block_enabled ? row.org_signature_title : null,
			signature_statement: row.org_signature_block_enabled ? row.org_signature_statement : null,
			signature_image_url: signatureImageUrl,
			contact_name: row.contact_name,
			issued_by_name: row.issued_by_name,
			service_address:
				row.service_address_id && row.addr_line_1
					? {
							id: row.service_address_id,
							label: row.addr_label!,
							address_line_1: row.addr_line_1,
							address_line_2: row.addr_line_2,
							city: row.addr_city!,
							state: row.addr_state!,
							zip: row.addr_zip!
						}
					: null,
			packages,
			accepted_package_id: row.accepted_package_id,
			accepted_total: row.accepted_total,
			line_items: lineItems
		}
	});
};
