import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
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
	const [balanceRow] = await db.execute<{ total_paid: string; amount_due: string }>(sql`
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

	let requestedAmountCents: number | null = null;
	let tipCents = 0;
	const rawBody = await event.request.text();
	if (rawBody.trim().length > 0) {
		try {
			const parsed = JSON.parse(rawBody) as { amount_cents?: unknown; tip_cents?: unknown };
			if (parsed.amount_cents !== undefined && parsed.amount_cents !== null) {
				const n = Number(parsed.amount_cents);
				if (!Number.isInteger(n) || n <= 0) {
					return json(
						{
							error: 'Enter a valid amount greater than zero.',
							field_errors: { amount_cents: 'Enter a valid amount.' }
						},
						{ status: 400 }
					);
				}
				if (n > amountDueCents) {
					return json(
						{
							error: 'Amount cannot exceed the balance due.',
							field_errors: { amount_cents: 'Cannot exceed balance due.' }
						},
						{ status: 400 }
					);
				}
				requestedAmountCents = n;
			}
			// Optional tip (M7). Only accepted when the org enabled tips; otherwise silently
			// ignored so a stale/hostile client can't attach a tip. A tip is EXTRA money on top
			// of the balance — capped generously (the greater of the charge or $1,000) to block
			// abuse without rejecting legitimate large-percentage tips on small invoices.
			if (invoice.tips_enabled && parsed.tip_cents !== undefined && parsed.tip_cents !== null) {
				const t = Number(parsed.tip_cents);
				if (!Number.isInteger(t) || t < 0) {
					return json(
						{
							error: 'Enter a valid tip amount.',
							field_errors: { tip_cents: 'Enter a valid tip.' }
						},
						{ status: 400 }
					);
				}
				tipCents = t;
			}
		} catch {
			return json({ error: 'Invalid request body.' }, { status: 400 });
		}
	}

	const chargeCents = requestedAmountCents ?? amountDueCents;
	const isPartial = chargeCents < amountDueCents;

	// Cap the tip generously against abuse: allow up to the charge amount or $1,000, whichever
	// is larger (covers a 20% tip on a small invoice without rejecting it).
	const tipCapCents = Math.max(chargeCents, 100_000);
	if (tipCents > tipCapCents) {
		return json(
			{
				error: 'Tip amount is too large.',
				field_errors: { tip_cents: 'Tip amount is too large.' }
			},
			{ status: 400 }
		);
	}

	const stripe = getOrgStripeClient(invoice.stripe_secret_key);
	const invoiceNumberDisplay = formatInvoiceNumber(invoice.invoice_number);

	// Build line items for Stripe. Use a single balance line to avoid rounding drift.
	const stripeLines = [
		{
			description: isPartial
				? `Partial payment for Invoice ${invoiceNumberDisplay}`
				: `Invoice ${invoiceNumberDisplay}`,
			quantity: 1,
			unit_amount_cents: chargeCents
		}
	];
	// Tip (M7) rides as its own line so the homeowner sees it broken out at checkout. The webhook
	// re-splits the received total using tip_cents metadata, so this line is display-only.
	if (tipCents > 0) {
		stripeLines.push({
			description: 'Tip',
			quantity: 1,
			unit_amount_cents: tipCents
		});
	}

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
		cancelUrl,
		tipCents
	});

	if (!session.url) {
		return json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
	}

	return json({ data: { url: session.url } });
};
