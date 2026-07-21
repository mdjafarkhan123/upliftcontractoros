import { json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations, outboxEvents, payments, quotes } from '$lib/server/db/schema';
import { getOrgStripeClient } from '$lib/server/invoices/stripe';
import { recalcInvoiceTotals } from '$lib/server/invoices/recalc';
import { invoicePaidEvent, paymentRecordedEvent } from '$lib/server/invoices/events';
import { formatCurrencyUsd, formatInvoiceNumber } from '$lib/server/invoices/format';
import { quoteDepositPaidEvent } from '$lib/server/quotes/events';
import { formatQuoteNumber } from '$lib/server/quotes/format';

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
		const kind = extractMetadataKind(evt);
		if (kind === 'quote_deposit') {
			const handled = await handleQuoteDepositPayment(evt, orgId);
			return json({ received: true, handled });
		}
		const handled = await handlePaymentEvent(evt, orgId);
		return json({ received: true, handled });
	}

	return json({ received: true, handled: false });
};

function extractMetadataKind(evt: Stripe.Event): string | undefined {
	if (evt.type === 'checkout.session.completed') {
		const s = evt.data.object as Stripe.Checkout.Session;
		return s.metadata?.kind;
	}
	if (evt.type === 'payment_intent.succeeded') {
		const pi = evt.data.object as Stripe.PaymentIntent;
		return pi.metadata?.kind;
	}
	return undefined;
}

async function handlePaymentEvent(evt: Stripe.Event, orgId: string): Promise<boolean> {
	let invoiceId: string | undefined;
	let paymentIntentId: string | undefined;
	let amountReceivedCents: number | undefined;
	let tipCentsRaw: string | undefined;

	if (evt.type === 'checkout.session.completed') {
		const session = evt.data.object as Stripe.Checkout.Session;
		invoiceId = session.metadata?.invoice_id;
		paymentIntentId =
			typeof session.payment_intent === 'string'
				? session.payment_intent
				: session.payment_intent?.id;
		amountReceivedCents = session.amount_total ?? undefined;
		tipCentsRaw = session.metadata?.tip_cents;
	} else if (evt.type === 'payment_intent.succeeded') {
		const pi = evt.data.object as Stripe.PaymentIntent;
		invoiceId = pi.metadata?.invoice_id;
		paymentIntentId = pi.id;
		amountReceivedCents = pi.amount_received;
		tipCentsRaw = pi.metadata?.tip_cents;
	}

	if (!invoiceId || !paymentIntentId || amountReceivedCents === undefined) return false;

	// M7: the received total includes the tip. Split it back out so payments.amount holds ONLY
	// the balance-applied portion (recalc uses it for amount_paid/amount_due) and tip_amount
	// holds the tip. Clamp defensively so a malformed tip can't exceed the received total.
	const parsedTip = Number.parseInt(tipCentsRaw ?? '0', 10);
	const tipCents =
		Number.isFinite(parsedTip) && parsedTip > 0 ? Math.min(parsedTip, amountReceivedCents) : 0;
	const balanceCents = amountReceivedCents - tipCents;
	const amountStr = (balanceCents / 100).toFixed(2);
	const tipStr = (tipCents / 100).toFixed(2);

	return await db.transaction(async (tx) => {
		const [existing] = await tx.execute<{
			id: string;
			status: string;
			total: string;
			amount_due: string;
			invoice_number: number;
		}>(sql`
			SELECT id, status, total, amount_due, invoice_number FROM invoices
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

		// Overpayment guard (defense-in-depth behind single-use Payment Links): never apply a
		// NEW, distinct payment to an invoice that is already fully settled. A reused/leaked link
		// or a manual + online payment race could otherwise stack a second real charge and drive
		// the balance negative. The captured funds are real, so this is surfaced loudly for a
		// Stripe-side refund rather than silently corrupting the ledger.
		if (existing.status === 'paid' || Number(existing.amount_due) <= 0) {
			console.error(
				`[stripe-webhook] Payment ${paymentIntentId} received for already-settled invoice ` +
					`${invoiceId} (status=${existing.status}, amount_due=${existing.amount_due}). ` +
					`NOT applied — refund this charge in Stripe.`
			);
			return false;
		}

		const [payment] = await tx
			.insert(payments)
			.values({
				org_id: orgId,
				invoice_id: invoiceId!,
				amount: amountStr,
				tip_amount: tipStr,
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

async function handleQuoteDepositPayment(evt: Stripe.Event, orgId: string): Promise<boolean> {
	let quoteId: string | undefined;
	let paymentIntentId: string | undefined;
	let amountReceivedCents: number | undefined;

	if (evt.type === 'checkout.session.completed') {
		const session = evt.data.object as Stripe.Checkout.Session;
		quoteId = session.metadata?.quote_id;
		paymentIntentId =
			typeof session.payment_intent === 'string'
				? session.payment_intent
				: session.payment_intent?.id;
		amountReceivedCents = session.amount_total ?? undefined;
	} else if (evt.type === 'payment_intent.succeeded') {
		const pi = evt.data.object as Stripe.PaymentIntent;
		quoteId = pi.metadata?.quote_id;
		paymentIntentId = pi.id;
		amountReceivedCents = pi.amount_received;
	}

	if (!quoteId || !paymentIntentId || amountReceivedCents === undefined) return false;

	return await db.transaction(async (tx) => {
		const [quote] = await tx.execute<{
			id: string;
			contact_id: string;
			status: string;
			quote_number: number;
			deposit_required: boolean;
			deposit_amount: string | null;
			deposit_paid_amount: number;
			deposit_stripe_payment_intent_id: string | null;
			deposit_applied_invoice_id: string | null;
		}>(sql`
			SELECT id, contact_id, status, quote_number, deposit_required, deposit_amount,
			       deposit_paid_amount, deposit_stripe_payment_intent_id, deposit_applied_invoice_id
			FROM quotes
			WHERE id = ${quoteId} AND org_id = ${orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!quote) return false;

		// Idempotency: same PI already applied to this quote → no-op.
		if (quote.deposit_stripe_payment_intent_id === paymentIntentId) return false;
		// Defensive: another deposit was already recorded for this quote.
		if (quote.deposit_paid_amount > 0) return false;
		if (!quote.deposit_required || quote.deposit_amount == null) return false;

		// V1: reject partial captures. Only the full requested deposit counts.
		const requestedCents = Math.round(Number(quote.deposit_amount) * 100);
		if (amountReceivedCents !== requestedCents) return false;

		const now = new Date();
		await tx
			.update(quotes)
			.set({
				deposit_paid_amount: amountReceivedCents,
				deposit_paid_at: now,
				deposit_stripe_payment_intent_id: paymentIntentId,
				updated_at: now
			})
			.where(eq(quotes.id, quote.id));

		const amountStr = (amountReceivedCents / 100).toFixed(2);
		const quoteNumberDisplay = formatQuoteNumber(quote.quote_number);

		await tx
			.insert(outboxEvents)
			.values(
				quoteDepositPaidEvent({
					orgId,
					quoteId: quote.id,
					contactId: quote.contact_id,
					amountFormatted: formatCurrencyUsd(amountStr),
					quoteNumberDisplay,
					stripePaymentIntentId: paymentIntentId
				})
			)
			.onConflictDoNothing({ target: outboxEvents.idempotency_key });

		// If an invoice was already created from this quote, auto-credit it now.
		// The payments.stripe_payment_intent_id partial unique index guards against
		// double-crediting on webhook retry.
		if (quote.deposit_applied_invoice_id) {
			const [invoice] = await tx.execute<{
				id: string;
				invoice_number: number;
				status: string;
				deleted_at: Date | null;
			}>(sql`
				SELECT id, invoice_number, status, deleted_at FROM invoices
				WHERE id = ${quote.deposit_applied_invoice_id} AND org_id = ${orgId}
				FOR UPDATE
			`);
			if (invoice && !invoice.deleted_at && invoice.status !== 'cancelled') {
				const [dup] = await tx
					.select({ id: payments.id })
					.from(payments)
					.where(eq(payments.stripe_payment_intent_id, paymentIntentId))
					.limit(1);
				if (!dup) {
					const [payment] = await tx
						.insert(payments)
						.values({
							org_id: orgId,
							invoice_id: invoice.id,
							amount: amountStr,
							payment_method: 'stripe',
							stripe_payment_intent_id: paymentIntentId,
							notes: `Deposit applied from Quote ${quoteNumberDisplay}`,
							recorded_by: null
						})
						.returning({ id: payments.id });

					await recalcInvoiceTotals(tx, invoice.id);

					const [after] = await tx.execute<{ status: string; total: string }>(sql`
						SELECT status, total FROM invoices WHERE id = ${invoice.id}
					`);

					await tx.insert(outboxEvents).values(
						paymentRecordedEvent({
							orgId,
							invoiceId: invoice.id,
							paymentId: payment.id,
							amountFormatted: formatCurrencyUsd(amountStr),
							invoiceNumberDisplay: formatInvoiceNumber(invoice.invoice_number)
						})
					);

					if (after.status === 'paid') {
						await tx
							.insert(outboxEvents)
							.values(
								invoicePaidEvent({
									orgId,
									invoiceId: invoice.id,
									paymentId: payment.id,
									totalFormatted: formatCurrencyUsd(after.total),
									invoiceNumberDisplay: formatInvoiceNumber(invoice.invoice_number)
								})
							)
							.onConflictDoNothing({ target: outboxEvents.idempotency_key });
					}
				}
			}
		}

		return true;
	});
}
