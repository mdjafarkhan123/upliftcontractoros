import Stripe from 'stripe';

export function getOrgStripeClient(secretKey: string | null | undefined): Stripe {
	if (!secretKey) {
		throw new Error('Stripe is not connected for this org');
	}
	return new Stripe(secretKey, { apiVersion: '2026-04-22.dahlia' });
}

export type CheckoutLineInput = {
	description: string;
	quantity: number;
	unit_amount_cents: number;
};

export async function createCheckoutSession(args: {
	stripe: Stripe;
	invoiceId: string;
	orgId: string;
	invoiceNumberDisplay: string;
	customerEmail: string | null;
	lineItems: CheckoutLineInput[];
	successUrl: string;
	cancelUrl: string;
	// Tip portion of this checkout (M7), in cents. Carried through metadata so the webhook
	// can split the received total into balance (payments.amount) vs tip (payments.tip_amount).
	// The caller adds the actual tip line to lineItems; here we only record the amount. Default 0.
	tipCents?: number;
}): Promise<Stripe.Checkout.Session> {
	const metadata = {
		kind: 'invoice_payment',
		invoice_id: args.invoiceId,
		org_id: args.orgId,
		invoice_number_display: args.invoiceNumberDisplay,
		tip_cents: String(args.tipCents ?? 0)
	};
	return args.stripe.checkout.sessions.create({
		mode: 'payment',
		customer_email: args.customerEmail ?? undefined,
		line_items: args.lineItems.map((li) => ({
			quantity: li.quantity,
			price_data: {
				currency: 'usd',
				unit_amount: li.unit_amount_cents,
				product_data: { name: li.description }
			}
		})),
		success_url: args.successUrl,
		cancel_url: args.cancelUrl,
		payment_intent_data: { metadata },
		metadata
	});
}

export function toCents(value: string | number): number {
	const n = typeof value === 'string' ? Number(value) : value;
	return Math.round(n * 100);
}

export async function createInvoicePaymentLink(args: {
	stripe: Stripe;
	invoiceId: string;
	orgId: string;
	invoiceNumberDisplay: string;
	amountDueCents: number;
}): Promise<{ id: string; url: string }> {
	const metadata = {
		kind: 'invoice_payment_link',
		invoice_id: args.invoiceId,
		org_id: args.orgId,
		invoice_number_display: args.invoiceNumberDisplay
	};
	const price = await args.stripe.prices.create({
		currency: 'usd',
		unit_amount: args.amountDueCents,
		product_data: { name: `Invoice ${args.invoiceNumberDisplay}` }
	});
	const link = await args.stripe.paymentLinks.create({
		line_items: [{ price: price.id, quantity: 1 }],
		metadata,
		payment_intent_data: { metadata }
	});
	return { id: link.id, url: link.url };
}

export async function deactivatePaymentLink(stripe: Stripe, paymentLinkId: string): Promise<void> {
	await stripe.paymentLinks.update(paymentLinkId, { active: false });
}

export async function createQuoteDepositCheckoutSession(args: {
	stripe: Stripe;
	quoteId: string;
	orgId: string;
	quoteNumberDisplay: string;
	customerEmail: string | null;
	depositAmountCents: number;
	successUrl: string;
	cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
	const metadata = {
		kind: 'quote_deposit',
		quote_id: args.quoteId,
		org_id: args.orgId,
		quote_number_display: args.quoteNumberDisplay
	};
	return args.stripe.checkout.sessions.create({
		mode: 'payment',
		customer_email: args.customerEmail ?? undefined,
		line_items: [
			{
				quantity: 1,
				price_data: {
					currency: 'usd',
					unit_amount: args.depositAmountCents,
					product_data: { name: `Deposit — Quote ${args.quoteNumberDisplay}` }
				}
			}
		],
		success_url: args.successUrl,
		cancel_url: args.cancelUrl,
		payment_intent_data: { metadata },
		metadata
	});
}
