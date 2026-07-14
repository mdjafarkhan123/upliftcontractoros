import { json, error } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, contactAddresses, quotes, quoteLineItems } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { formatQuoteNumber } from '$lib/server/quotes/format';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_view_full_pipeline) error(403, 'Forbidden');

	const quoteId = event.params.id!;

	const [quote] = await db
		.select({
			id: quotes.id,
			org_id: quotes.org_id,
			contact_id: quotes.contact_id,
			opportunity_id: quotes.opportunity_id,
			title: quotes.title,
			quote_number: quotes.quote_number,
			total: quotes.total,
			discount_type: quotes.discount_type,
			discount_value: quotes.discount_value,
			discount_label: quotes.discount_label,
			tax_rate: quotes.tax_rate,
			internal_notes: quotes.internal_notes,
			service_address_id: quotes.service_address_id,
			accepted_package_id: quotes.accepted_package_id,
			status: quotes.status
		})
		.from(quotes)
		.where(and(eq(quotes.id, quoteId), eq(quotes.org_id, auth.orgId), isNull(quotes.deleted_at)))
		.limit(1);

	if (!quote) error(404, 'Quote not found');

	const [contact] = await db
		.select({
			id: contacts.id,
			full_name: contacts.full_name,
			phone: contacts.phone,
			email: contacts.email
		})
		.from(contacts)
		.where(and(eq(contacts.id, quote.contact_id), eq(contacts.org_id, auth.orgId)))
		.limit(1);

	if (!contact) error(404, 'Contact not found');

	// Resolve service address: prefer the quote's linked address, fall back to contact primary
	let serviceAddress: {
		line1: string | null;
		line2: string | null;
		city: string | null;
		state: string | null;
		zip: string | null;
	} = { line1: null, line2: null, city: null, state: null, zip: null };

	if (quote.service_address_id) {
		const [addr] = await db
			.select({
				address_line_1: contactAddresses.address_line_1,
				address_line_2: contactAddresses.address_line_2,
				city: contactAddresses.city,
				state: contactAddresses.state,
				zip: contactAddresses.zip
			})
			.from(contactAddresses)
			.where(
				and(eq(contactAddresses.id, quote.service_address_id), isNull(contactAddresses.deleted_at))
			)
			.limit(1);
		if (addr) {
			serviceAddress = {
				line1: addr.address_line_1,
				line2: addr.address_line_2 ?? null,
				city: addr.city,
				state: addr.state,
				zip: addr.zip
			};
		}
	}

	if (!serviceAddress.line1) {
		const [primary] = await db
			.select({
				address_line_1: contactAddresses.address_line_1,
				address_line_2: contactAddresses.address_line_2,
				city: contactAddresses.city,
				state: contactAddresses.state,
				zip: contactAddresses.zip
			})
			.from(contactAddresses)
			.where(
				and(
					eq(contactAddresses.contact_id, quote.contact_id),
					eq(contactAddresses.org_id, auth.orgId),
					isNull(contactAddresses.deleted_at)
				)
			)
			.orderBy(desc(contactAddresses.is_primary))
			.limit(1);
		if (primary) {
			serviceAddress = {
				line1: primary.address_line_1,
				line2: primary.address_line_2 ?? null,
				city: primary.city,
				state: primary.state,
				zip: primary.zip
			};
		}
	}

	// Pull the quote's lines as editable JOB line drafts. Snapshot model: we copy the deal's
	// committed work — required lines PLUS any optional add-ons the customer accepted — and drop
	// the offer-only `is_optional` flag (a job line is always committed). After conversion the
	// job's lines are fully independent of the quote.
	const lineItems = await db
		.select({
			line_key: quoteLineItems.line_key,
			description: quoteLineItems.description,
			details: quoteLineItems.details,
			quantity: quoteLineItems.quantity,
			unit: quoteLineItems.unit,
			section_label: quoteLineItems.section_label,
			unit_price: quoteLineItems.unit_price,
			unit_cost: quoteLineItems.unit_cost,
			taxable: quoteLineItems.taxable,
			source_catalog_item_id: quoteLineItems.source_catalog_item_id,
			position: quoteLineItems.position
		})
		.from(quoteLineItems)
		.where(
			and(
				eq(quoteLineItems.quote_id, quoteId),
				eq(quoteLineItems.org_id, auth.orgId),
				isNull(quoteLineItems.deleted_at),
				or(eq(quoteLineItems.is_optional, false), eq(quoteLineItems.accepted_selected, true)),
				// Good-Better-Best: carry ONLY the accepted tier's lines into the job. Null on a
				// simple quote → no extra filter.
				quote.accepted_package_id
					? eq(quoteLineItems.package_id, quote.accepted_package_id)
					: undefined
			)
		)
		.orderBy(asc(quoteLineItems.position));

	return json({
		data: {
			title: quote.title,
			contact_id: quote.contact_id,
			contact_name: contact.full_name,
			contact_phone: contact.phone ?? null,
			contact_email: contact.email ?? null,
			opportunity_id: quote.opportunity_id ?? null,
			quote_number_display: formatQuoteNumber(quote.quote_number),
			notes: quote.internal_notes ?? null,
			service_address: serviceAddress,
			// Pricing snapshot — carries the quote's discount + tax so the job opens matching the
			// deal, then is freely editable.
			discount_type: quote.discount_type,
			discount_value: quote.discount_value,
			discount_label: quote.discount_label,
			tax_rate: quote.tax_rate,
			line_items: lineItems.map((li) => ({
				line_key: li.line_key,
				description: li.description,
				details: li.details,
				quantity: li.quantity,
				unit: li.unit,
				section_label: li.section_label,
				unit_price: li.unit_price,
				unit_cost: li.unit_cost,
				taxable: li.taxable,
				source_catalog_item_id: li.source_catalog_item_id,
				position: li.position
			}))
		}
	});
};
