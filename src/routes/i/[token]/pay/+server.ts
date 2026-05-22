import { json } from '@sveltejs/kit';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { invoiceLineItems, invoices, payments } from '$lib/server/db/schema';
import { lookupValidInvoiceByToken } from '$lib/server/invoices/publicAccess';
import { rateLimit } from '$lib/server/quotes/rateLimit';
import { sha256Hex, clientIpFrom } from '$lib/server/invoices/publicAccess';
import { createCheckoutSession, getOrgStripeClient, toCents } from '$lib/server/invoices/stripe';
import { formatInvoiceNumber } from '$lib/server/invoices/format';

export const POST: RequestHandler = async (event) => {
	const ipHash = sha256Hex(clientIpFrom(event.request));
	const rl = await rateLimit('i.pay', ipHash, 5, 60);
	if (!rl.ok) {
		return json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
	}

	const token = event.params.token!;
	const result = await lookupValidInvoiceByToken(token);
	if (!result.ok) {
		return json({ error: 'Invoice no longer available' }, { status: 404 });
	}
	const invoice = result.invoice;

	if (invoice.status === 'paid') {
		return json({ error: 'This invoice has already been paid.' }, { status: 422 });
	}
	if (!invoice.stripe_secret_key) {
		return json({ error: 'Online payment is not available for this invoice.' }, { status: 422 });
	}

	// Derive balance from payments table — server-authoritative.
	const [balanceRow] = await db
		.execute<{ total_paid: string; amount_due: string }>(sql`
			SELECT
				COALESCE(SUM(p.amount), 0)::text AS total_paid,
				GREATEST(0, i.total - COALESCE(SUM(p.amount), 0))::text AS amount_due
			FROM invoices i
			LEFT JOIN payments p ON p.invoice_id = i.id
			WHERE i.id = ${invoice.id}
			GROUP BY i.id, i.total
		`);

	const amountDueCents = toCents(balanceRow?.amount_due ?? '0');
	if (amountDueCents <= 0) {
		return json({ error: 'Nothing is due on this invoice.' }, { status: 422 });
	}

	const lineRows = await db
		.select({
			description: invoiceLineItems.description,
			quantity: invoiceLineItems.quantity,
			unit_price: invoiceLineItems.unit_price,
			total: invoiceLineItems.total
		})
		.from(invoiceLineItems)
		.where(
			and(
				eq(invoiceLineItems.invoice_id, invoice.id),
				isNull(invoiceLineItems.deleted_at)
			)
		)
		.orderBy(asc(invoiceLineItems.position));

	const stripe = getOrgStripeClient(invoice.stripe_secret_key);
	const invoiceNumberDisplay = formatInvoiceNumber(invoice.invoice_number);

	// Build line items for Stripe. Use a single balance line to avoid rounding drift.
	const stripeLines = [{
		description: `Invoice ${invoiceNumberDisplay}`,
		quantity: 1,
		unit_amount_cents: amountDueCents
	}];

	const origin = event.url.origin;
	const successUrl = `${origin}/i/${token}?paid=1`;
	const cancelUrl = `${origin}/i/${token}`;

	const session = await createCheckoutSession({
		stripe,
		invoiceId: invoice.id,
		orgId: invoice.org_id,
		invoiceNumberDisplay,
		customerEmail: invoice.contact_email,
		lineItems: stripeLines,
		successUrl,
		cancelUrl
	});

	if (!session.url) {
		return json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
	}

	return json({ data: { url: session.url } });
};
