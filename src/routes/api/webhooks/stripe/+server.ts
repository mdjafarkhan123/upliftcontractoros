import { json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations, outboxEvents, payments } from '$lib/server/db/schema';
import { getOrgStripeClient } from '$lib/server/invoices/stripe';
import { recalcInvoiceTotals } from '$lib/server/invoices/recalc';
import { invoicePaidEvent, paymentRecordedEvent } from '$lib/server/invoices/events';
import { formatCurrencyUsd, formatInvoiceNumber } from '$lib/server/invoices/format';

export const POST: RequestHandler = async (event) => {
	const orgId = event.url.searchParams.get('org_id');
	if (!orgId) return json({ error: 'Missing org_id' }, { status: 400 });

	const sigHeader = event.request.headers.get('stripe-signature');
	if (!sigHeader) return json({ error: 'Missing signature' }, { status: 400 });

	// Critical: read raw body BEFORE any JSON parsing for Stripe signature verification.
	const rawBody = await event.request.text();

	const [org] = await db
		.select({
			id: organizations.id,
			stripe_secret_key: organizations.stripe_restricted_key,
			stripe_webhook_secret: organizations.stripe_webhook_secret
		})
		.from(organizations)
		.where(eq(organizations.id, orgId))
		.limit(1);

	if (!org || !org.stripe_webhook_secret || !org.stripe_secret_key) {
		return json({ error: 'Org not configured for Stripe' }, { status: 404 });
	}

	const stripe = getOrgStripeClient(org.stripe_secret_key);

	let evt: Stripe.Event;
	try {
		evt = stripe.webhooks.constructEvent(rawBody, sigHeader, org.stripe_webhook_secret);
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Invalid signature';
		return json({ error: `Webhook signature verification failed: ${msg}` }, { status: 400 });
	}

	if (evt.type === 'checkout.session.completed' || evt.type === 'payment_intent.succeeded') {
		const handled = await handlePaymentEvent(evt, orgId);
		return json({ received: true, handled });
	}

	return json({ received: true, handled: false });
};

async function handlePaymentEvent(evt: Stripe.Event, orgId: string): Promise<boolean> {
	let invoiceId: string | undefined;
	let paymentIntentId: string | undefined;
	let amountReceivedCents: number | undefined;

	if (evt.type === 'checkout.session.completed') {
		const session = evt.data.object as Stripe.Checkout.Session;
		invoiceId = session.metadata?.invoice_id;
		paymentIntentId =
			typeof session.payment_intent === 'string'
				? session.payment_intent
				: session.payment_intent?.id;
		amountReceivedCents = session.amount_total ?? undefined;
	} else if (evt.type === 'payment_intent.succeeded') {
		const pi = evt.data.object as Stripe.PaymentIntent;
		invoiceId = pi.metadata?.invoice_id;
		paymentIntentId = pi.id;
		amountReceivedCents = pi.amount_received;
	}

	if (!invoiceId || !paymentIntentId || amountReceivedCents === undefined) return false;

	const amountStr = (amountReceivedCents / 100).toFixed(2);

	return await db.transaction(async (tx) => {
		const [existing] = await tx.execute<{
			id: string;
			status: string;
			total: string;
			invoice_number: number;
		}>(sql`
			SELECT id, status, total, invoice_number FROM invoices
			WHERE id = ${invoiceId} AND org_id = ${orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!existing) return false;

		// Idempotency: check if this payment intent has already been recorded.
		// Stripe can retry webhooks; the payments.stripe_payment_intent_id partial unique
		// index also guards against races, but checking explicitly lets us short-circuit cleanly.
		const [dup] = await tx
			.select({ id: payments.id })
			.from(payments)
			.where(eq(payments.stripe_payment_intent_id, paymentIntentId!))
			.limit(1);
		if (dup) return false;

		const [payment] = await tx
			.insert(payments)
			.values({
				org_id: orgId,
				invoice_id: invoiceId!,
				amount: amountStr,
				payment_method: 'stripe',
				stripe_payment_intent_id: paymentIntentId!,
				recorded_by: null
			})
			.returning({ id: payments.id });

		await recalcInvoiceTotals(tx, invoiceId!);

		const [after] = await tx.execute<{ id: string; status: string; total: string }>(sql`
			SELECT id, status, total FROM invoices WHERE id = ${invoiceId}
		`);

		await tx.insert(outboxEvents).values(
			paymentRecordedEvent({
				orgId,
				invoiceId: invoiceId!,
				paymentId: payment.id,
				amountFormatted: formatCurrencyUsd(amountStr),
				invoiceNumberDisplay: formatInvoiceNumber(existing.invoice_number)
			})
		);

		if (after.status === 'paid') {
			// Idempotent: idempotency_key for invoice.paid is invoice-scoped, so webhook
			// retries or a manual+webhook race cannot emit it twice.
			await tx
				.insert(outboxEvents)
				.values(
					invoicePaidEvent({
						orgId,
						invoiceId: invoiceId!,
						paymentId: payment.id,
						totalFormatted: formatCurrencyUsd(after.total),
						invoiceNumberDisplay: formatInvoiceNumber(existing.invoice_number)
					})
				)
				.onConflictDoNothing({ target: outboxEvents.idempotency_key });
		}

		return true;
	});
}
