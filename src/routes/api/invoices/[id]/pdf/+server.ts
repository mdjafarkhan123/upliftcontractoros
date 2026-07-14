import { json, error } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	invoiceLineItems,
	invoices,
	organizations,
	payments
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewAnyInvoice } from '$lib/server/invoices/permissions';
import { generateAndStoreInvoicePdf } from '$lib/server/invoices/pdf';
import { formatInvoiceNumber } from '$lib/server/invoices/format';
import { loadJobSignoff } from '$lib/server/jobs/signoffResponse';

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const [row] = await db
		.select({
			invoice: invoices,
			contact: contacts,
			org: organizations
		})
		.from(invoices)
		.innerJoin(contacts, eq(contacts.id, invoices.contact_id))
		.innerJoin(organizations, eq(organizations.id, invoices.org_id))
		.where(and(eq(invoices.id, id), eq(invoices.org_id, auth.orgId), isNull(invoices.deleted_at)))
		.limit(1);
	if (!row) error(404, 'Invoice not found');

	const lineItems = await db
		.select({
			description: invoiceLineItems.description,
			quantity: invoiceLineItems.quantity,
			unit_price: invoiceLineItems.unit_price,
			total: invoiceLineItems.total,
			taxable: invoiceLineItems.taxable
		})
		.from(invoiceLineItems)
		.where(
			and(
				eq(invoiceLineItems.invoice_id, id),
				eq(invoiceLineItems.org_id, auth.orgId),
				eq(invoiceLineItems.is_late_fee, false),
				isNull(invoiceLineItems.deleted_at)
			)
		)
		.orderBy(asc(invoiceLineItems.position), asc(invoiceLineItems.created_at));

	const paymentRows = await db
		.select({
			amount: payments.amount,
			tip_amount: payments.tip_amount,
			payment_method: payments.payment_method,
			paid_at: payments.paid_at,
			notes: payments.notes
		})
		.from(payments)
		.where(eq(payments.invoice_id, id))
		.orderBy(desc(payments.paid_at));

	// Client sign-off (Session 6): when this invoice came from a job the customer signed off on,
	// print the signature as proof-of-approval on the work order — Jobber/ServiceTitan behavior.
	let signoff: { signer_name: string | null; signed_at: string; signature_url: string } | null =
		null;
	if (row.invoice.job_id) {
		const s = await loadJobSignoff(auth.orgId, row.invoice.job_id);
		if (s.signed_at && s.signature) {
			signoff = {
				signer_name: s.signer_name,
				signed_at: s.signed_at,
				signature_url: s.signature.full_url
			};
		}
	}

	const { url } = await generateAndStoreInvoicePdf({
		org: {
			name: row.org.name,
			address: row.org.address,
			city: row.org.city,
			state: row.org.state,
			zip: row.org.zip,
			twilio_phone_number: row.org.twilio_phone_number
		},
		invoice: {
			id: row.invoice.id,
			invoice_number_display: formatInvoiceNumber(row.invoice.invoice_number),
			title: row.invoice.title,
			status: row.invoice.status,
			subtotal: row.invoice.subtotal,
			discount_type: row.invoice.discount_type,
			discount_value: row.invoice.discount_value,
			discount_amount: row.invoice.discount_amount,
			discount_label: row.invoice.discount_label,
			tax_rate: row.invoice.tax_rate,
			tax_amount: row.invoice.tax_amount,
			total: row.invoice.total,
			amount_paid: row.invoice.amount_paid,
			amount_due: row.invoice.amount_due,
			tip_total: row.invoice.tip_total,
			late_fee_total: row.invoice.late_fee_total,
			notes: row.invoice.notes,
			terms: row.invoice.terms,
			due_date: row.invoice.due_date,
			created_at: row.invoice.created_at
		},
		contact: {
			full_name: row.contact.full_name,
			email: row.contact.email,
			phone: row.contact.phone
		},
		lineItems,
		payments: paymentRows,
		signoff
	});

	return json({ data: { url, expires_in: 3600 } });
};
