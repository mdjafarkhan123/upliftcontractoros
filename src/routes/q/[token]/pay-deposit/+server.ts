import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, organizations } from '$lib/server/db/schema';
import { clientIpFrom, lookupValidQuoteByToken, sha256Hex } from '$lib/server/quotes/publicAccess';
import { rateLimit } from '$lib/server/quotes/rateLimit';
import {
	createQuoteDepositCheckoutSession,
	getOrgStripeClient,
	toCents
} from '$lib/server/invoices/stripe';
import { formatQuoteNumber } from '$lib/server/quotes/format';

function unavailable(): Response {
	return json({ error: 'Quote no longer available' }, { status: 404 });
}

export const POST: RequestHandler = async (event) => {
	const ipHash = sha256Hex(clientIpFrom(event.request));
	const rl = await rateLimit('q.pay_deposit', ipHash, 10, 60);
	if (!rl.ok) return json({ error: 'Quote no longer available' }, { status: 429 });

	const token = event.params.token!;
	const result = await lookupValidQuoteByToken(token);
	if (!result.ok) return unavailable();
	const quote = result.quote;

	if (quote.status !== 'accepted') {
		return json({ error: 'Quote must be accepted before paying a deposit' }, { status: 422 });
	}
	if (!quote.deposit_required || quote.deposit_amount == null) {
		return json({ error: 'This quote has no deposit' }, { status: 422 });
	}
	if (quote.deposit_paid_amount > 0) {
		return json({ error: 'Deposit already paid' }, { status: 422 });
	}

	const [org] = await db
		.select({
			stripe_secret_key: organizations.stripe_restricted_key
		})
		.from(organizations)
		.where(eq(organizations.id, quote.org_id))
		.limit(1);

	if (!org?.stripe_secret_key) {
		return json({ error: 'Online deposit payment is not available' }, { status: 422 });
	}

	const [contactRow] = await db
		.select({ email: contacts.email })
		.from(contacts)
		.where(eq(contacts.id, quote.contact_id))
		.limit(1);

	const stripe = getOrgStripeClient(org.stripe_secret_key);
	const depositAmountCents = toCents(quote.deposit_amount);

	if (depositAmountCents <= 0) {
		return json({ error: 'Invalid deposit amount' }, { status: 422 });
	}

	const origin = event.url.origin;
	const session = await createQuoteDepositCheckoutSession({
		stripe,
		quoteId: quote.id,
		orgId: quote.org_id,
		quoteNumberDisplay: formatQuoteNumber(quote.quote_number),
		customerEmail: contactRow?.email ?? null,
		depositAmountCents,
		successUrl: `${origin}/q/${token}?deposit=success`,
		cancelUrl: `${origin}/q/${token}?deposit=cancelled`
	});

	if (!session.url) {
		return json({ error: 'Unable to start deposit payment' }, { status: 502 });
	}

	return json({ data: { url: session.url } });
};
