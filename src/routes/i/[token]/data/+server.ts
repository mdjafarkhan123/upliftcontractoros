import { json } from '@sveltejs/kit';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	invoiceLineItems,
	invoiceViews,
	invoices,
	media,
	outboxEvents,
	payments
} from '$lib/server/db/schema';
import { r2Presign } from '$lib/server/media/r2';
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
			taxable: invoiceLineItems.taxable,
			position: invoiceLineItems.position
		})
		.from(invoiceLineItems)
		.where(
			and(
				eq(invoiceLineItems.invoice_id, invoice.id),
				eq(invoiceLineItems.is_late_fee, false),
				sql`${invoiceLineItems.deleted_at} IS NULL`
			)
		)
		.orderBy(invoiceLineItems.position);

	// Derive actual balance from payments table — never trust denormalized amount_paid.
	const paymentRows = await db
		.select({ amount: payments.amount, tip_amount: payments.tip_amount, paid_at: payments.paid_at })
		.from(payments)
		.where(eq(payments.invoice_id, invoice.id))
		.orderBy(payments.paid_at);

	const totalPaid = paymentRows.reduce((s, p) => s + Number(p.amount), 0);
	const totalDue = Math.max(0, Number(invoice.total) - totalPaid);
	// M7: tips are extra money, summed independently — never affects totalDue/totalPaid.
	const totalTip = paymentRows.reduce((s, p) => s + Number(p.tip_amount), 0);

	// Read-only display of the customer's in-person signature, when one is on file. Resolve a
	// short-lived signed URL for the drawn image.
	let signature: { signer_name: string | null; signed_at: string; url: string } | null = null;
	if (invoice.signature_media_id && invoice.signed_at) {
		const [sig] = await db
			.select({ r2_key: media.r2_key, web_key: media.web_key })
			.from(media)
			.where(
				and(
					eq(media.id, invoice.signature_media_id),
					eq(media.org_id, invoice.org_id),
					eq(media.purpose_tag, 'invoice_signature'),
					isNull(media.deleted_at)
				)
			)
			.limit(1);
		if (sig) {
			signature = {
				signer_name: invoice.signature_name,
				signed_at: invoice.signed_at.toISOString(),
				url: await r2Presign(sig.web_key ?? sig.r2_key, 3600)
			};
		}
	}

	return json({
		data: {
			invoice_number_display: formatInvoiceNumber(invoice.invoice_number),
			title: invoice.title,
			status: invoice.status,
			subtotal: invoice.subtotal,
			discount_type: invoice.discount_type,
			discount_value: invoice.discount_value,
			discount_amount: invoice.discount_amount,
			discount_label: invoice.discount_label,
			tax_rate: invoice.tax_rate,
			tax_amount: invoice.tax_amount,
			total: invoice.total,
			amount_paid: totalPaid.toFixed(2),
			amount_due: totalDue.toFixed(2),
			tip_total: totalTip.toFixed(2),
			late_fee_total: invoice.late_fee_total,
			notes: invoice.notes,
			terms: invoice.terms,
			due_date: invoice.due_date,
			org_name: invoice.org_name,
			has_stripe: Boolean(invoice.stripe_secret_key),
			// M7: gate + presets for the tip selector on the pay page. Only online (Stripe) tips
			// are collectable here; manual tips are logged by the contractor in the app.
			tips_enabled: invoice.tips_enabled,
			tip_presets: invoice.tip_preset_percents,
			line_items: lineItems,
			signature
		}
	});
};
