import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	invoiceLineItems,
	invoices,
	organizations
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendInvoice } from '$lib/server/invoices/permissions';
import {
	createCheckoutSession,
	getOrgStripeClient,
	toCents
} from '$lib/server/invoices/stripe';
import { formatInvoiceNumber } from '$lib/server/invoices/format';

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const [row] = await db
		.select({
			id: invoices.id,
			status: invoices.status,
			total: invoices.total,
			amount_due: invoices.amount_due,
			invoice_number: invoices.invoice_number,
			tax_rate: invoices.tax_rate,
			tax_amount: invoices.tax_amount,
			contact_email: contacts.email,
			stripe_secret_key: organizations.stripe_restricted_key
		})
		.from(invoices)
		.innerJoin(contacts, eq(contacts.id, invoices.contact_id))
		.innerJoin(organizations, eq(organizations.id, invoices.org_id))
		.where(
			and(eq(invoices.id, id), eq(invoices.org_id, auth.orgId), isNull(invoices.deleted_at))
		)
		.limit(1);

	if (!row) error(404, 'Invoice not found');
	if (row.status === 'cancelled') error(422, 'Cancelled invoices cannot accept payments');
	if (row.status === 'paid') error(422, 'Invoice is already paid');
	if (Number(row.amount_due) <= 0) error(422, 'Nothing to charge — balance is zero');
	if (!row.stripe_secret_key) {
		return json({ error: 'Stripe is not connected for this org' }, { status: 422 });
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
				eq(invoiceLineItems.invoice_id, id),
				eq(invoiceLineItems.org_id, auth.orgId),
				isNull(invoiceLineItems.deleted_at)
			)
		)
		.orderBy(asc(invoiceLineItems.position), asc(invoiceLineItems.created_at));

	if (lineRows.length === 0) error(422, 'Invoice has no line items');

	const stripe = getOrgStripeClient(row.stripe_secret_key);

	const subtotalCents = lineRows.reduce(
		(s, li) => s + toCents(li.total),
		0
	);
	const taxAmountCents = toCents(row.tax_amount);

	const stripeLines = lineRows.map((li) => ({
		description: li.description,
		quantity: 1,
		unit_amount_cents: toCents(li.total)
	}));

	if (taxAmountCents > 0) {
		stripeLines.push({
			description: 'Tax',
			quantity: 1,
			unit_amount_cents: taxAmountCents
		});
	}

	const expectedCents = subtotalCents + taxAmountCents;
	const dueCents = toCents(row.amount_due);
	if (dueCents !== expectedCents) {
		// Defensive: if amount_due has drifted from line totals, fall back to a single line for the balance
		stripeLines.length = 0;
		stripeLines.push({
			description: `Invoice ${formatInvoiceNumber(row.invoice_number)}`,
			quantity: 1,
			unit_amount_cents: dueCents
		});
	}

	const origin = event.url.origin;
	const invoiceNumberDisplay = formatInvoiceNumber(row.invoice_number);

	const session = await createCheckoutSession({
		stripe,
		invoiceId: row.id,
		orgId: auth.orgId,
		invoiceNumberDisplay,
		customerEmail: row.contact_email,
		lineItems: stripeLines,
		successUrl: `${origin}/invoices/${row.id}?paid=1`,
		cancelUrl: `${origin}/invoices/${row.id}?paid=0`
	});

	if (!session.url) {
		return json({ error: 'Stripe did not return a checkout URL' }, { status: 502 });
	}

	await db
		.update(invoices)
		.set({ stripe_payment_link_url: session.url, updated_at: new Date() })
		.where(eq(invoices.id, id));

	return json({ data: { url: session.url, session_id: session.id } });
};
