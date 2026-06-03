import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, organizations, quoteLineItems, quotes } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewAnyQuote } from '$lib/server/quotes/permissions';
import { generateAndStoreQuotePdf } from '$lib/server/quotes/pdf';
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
			org: organizations
		})
		.from(quotes)
		.innerJoin(contacts, eq(contacts.id, quotes.contact_id))
		.innerJoin(organizations, eq(organizations.id, quotes.org_id))
		.where(and(eq(quotes.id, id), eq(quotes.org_id, auth.orgId), isNull(quotes.deleted_at)))
		.limit(1);
	if (!row) error(404, 'Quote not found');

	const lineItems = await db
		.select({
			description: quoteLineItems.description,
			quantity: quoteLineItems.quantity,
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

	const { url } = await generateAndStoreQuotePdf({
		org: {
			name: row.org.name,
			address: row.org.address,
			city: row.org.city,
			state: row.org.state,
			zip: row.org.zip,
			twilio_phone_number: row.org.twilio_phone_number
		},
		quote: {
			id: row.quote.id,
			quote_number_display: formatQuoteNumber(row.quote.quote_number),
			title: row.quote.title,
			subtotal: row.quote.subtotal,
			tax_rate: row.quote.tax_rate,
			tax_amount: row.quote.tax_amount,
			total: row.quote.total,
			notes: row.quote.notes,
			deposit_required: row.quote.deposit_required,
			deposit_amount: row.quote.deposit_amount,
			created_at: row.quote.created_at
		},
		contact: {
			full_name: row.contact.full_name,
			email: row.contact.email,
			phone: row.contact.phone
		},
		lineItems
	});

	return json({ data: { url, expires_in: 3600 } });
};
