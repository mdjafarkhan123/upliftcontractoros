import { json } from '@sveltejs/kit';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { invoiceLineItems, invoiceViews, invoices, outboxEvents, payments } from '$lib/server/db/schema';
import {
	clientIpFrom,
	lookupValidInvoiceByToken,
	sha256Hex
} from '$lib/server/invoices/publicAccess';
import { rateLimit } from '$lib/server/quotes/rateLimit';
import { formatInvoiceNumber } from '$lib/server/invoices/format';
import { invoiceViewedEvent } from '$lib/server/invoices/events';

const VIEW_DEDUP_SECONDS = 60;

export const GET: RequestHandler = async (event) => {
	const ipHash = sha256Hex(clientIpFrom(event.request));
	const rl = await rateLimit('i.view', ipHash, 60, 60);
	if (!rl.ok) {
		return json({ error: 'Invoice no longer available' }, { status: 429 });
	}

	const token = event.params.token!;
	const result = await lookupValidInvoiceByToken(token);
	if (!result.ok) {
		return json({ error: 'Invoice no longer available' }, { status: 404 });
	}
	const invoice = result.invoice;

	const ua = event.request.headers.get('user-agent') ?? '';
	const uaHash = sha256Hex(ua);

	// View tracking — best-effort; never blocks the page load.
	try {
		await db.transaction(async (tx) => {
			const cutoff = new Date(Date.now() - VIEW_DEDUP_SECONDS * 1000);
			const [recent] = await tx
				.select({ id: invoiceViews.id })
				.from(invoiceViews)
				.where(
					and(
						eq(invoiceViews.invoice_id, invoice.id),
						eq(invoiceViews.ip_hash, ipHash),
						gte(invoiceViews.viewed_at, cutoff)
					)
				)
				.limit(1);
			if (recent) return;

			const [view] = await tx
				.insert(invoiceViews)
				.values({
					org_id: invoice.org_id,
					invoice_id: invoice.id,
					ip_hash: ipHash,
					user_agent_hash: uaHash
				})
				.returning({ id: invoiceViews.id });

			// Only the first qualifying view triggers invoice.viewed and sets viewed_at.
			if (!invoice.viewed_at) {
				await tx
					.update(invoices)
					.set({ viewed_at: new Date(), updated_at: new Date() })
					.where(eq(invoices.id, invoice.id));

				await tx
					.insert(outboxEvents)
					.values(
						invoiceViewedEvent({
							orgId: invoice.org_id,
							invoiceId: invoice.id,
							contactId: invoice.contact_id,
							viewId: view.id,
							ipHash
						})
					)
					.onConflictDoNothing({ target: outboxEvents.idempotency_key });
			}
		});
	} catch (err) {
		console.error('[invoice-view] tracking failed:', err);
	}

	// Fetch line items and payment history for the public projection.
	const lineItems = await db
		.select({
			id: invoiceLineItems.id,
			description: invoiceLineItems.description,
			quantity: invoiceLineItems.quantity,
			unit_price: invoiceLineItems.unit_price,
			total: invoiceLineItems.total,
			position: invoiceLineItems.position
		})
		.from(invoiceLineItems)
		.where(
			and(
				eq(invoiceLineItems.invoice_id, invoice.id),
				sql`${invoiceLineItems.deleted_at} IS NULL`
			)
		)
		.orderBy(invoiceLineItems.position);

	// Derive actual balance from payments table — never trust denormalized amount_paid.
	const paymentRows = await db
		.select({ amount: payments.amount, paid_at: payments.paid_at })
		.from(payments)
		.where(eq(payments.invoice_id, invoice.id))
		.orderBy(payments.paid_at);

	const totalPaid = paymentRows.reduce((s, p) => s + Number(p.amount), 0);
	const totalDue = Math.max(0, Number(invoice.total) - totalPaid);

	return json({
		data: {
			invoice_number_display: formatInvoiceNumber(invoice.invoice_number),
			title: invoice.title,
			status: invoice.status,
			subtotal: invoice.subtotal,
			tax_rate: invoice.tax_rate,
			tax_amount: invoice.tax_amount,
			total: invoice.total,
			amount_paid: totalPaid.toFixed(2),
			amount_due: totalDue.toFixed(2),
			notes: invoice.notes,
			due_date: invoice.due_date,
			org_name: invoice.org_name,
			has_stripe: Boolean(invoice.stripe_secret_key),
			line_items: lineItems
		}
	});
};
