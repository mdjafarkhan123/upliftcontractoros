# MUST-READ — Production Cutover Checklist

This file lists code that depends on the request origin and must be migrated to a
canonical `APP_URL` env var before going to production. The dev-time fallback
(`event.url.origin`) works on a single domain but will silently break if requests
arrive on a preview URL, a Vercel deploy URL, or any host that is not the public
production domain.

Read this file end-to-end before deploying the Invoices/Payments module to prod.

---

## 1. Add the env var

Production env (Vercel / hosting platform) must define:

```
APP_URL=https://app.your-domain.com
```

No trailing slash. This must be the public, customer-facing URL.

Optional Stripe-specific keys exist already (`stripe_restricted_key`,
`stripe_webhook_secret`) on the `organizations` row — do not put those here.
`APP_URL` is platform-wide, not per-org.

---

## 2. Code that currently uses `event.url.origin` — replace with `APP_URL`

### `src/routes/api/invoices/[id]/create-checkout-session/+server.ts`

The Stripe Checkout Session's `success_url` and `cancel_url` are built from
`event.url.origin`. In production, route this through the canonical `APP_URL` so
the customer is redirected to the real public domain after paying.

**Find (top of the file near the imports):**

```ts
import { json, error } from '@sveltejs/kit';
```

**Add an env import:**

```ts
import { env } from '$env/dynamic/private';
```

**Find (around the bottom of the `POST` handler):**

```ts
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
```

**Replace with:**

```ts
const baseUrl = (env.APP_URL ?? event.url.origin).replace(/\/$/, '');
const invoiceNumberDisplay = formatInvoiceNumber(row.invoice_number);

const session = await createCheckoutSession({
	stripe,
	invoiceId: row.id,
	orgId: auth.orgId,
	invoiceNumberDisplay,
	customerEmail: row.contact_email,
	lineItems: stripeLines,
	successUrl: `${baseUrl}/invoices/${row.id}?paid=1`,
	cancelUrl: `${baseUrl}/invoices/${row.id}?paid=0`
});
```

Behavior: `APP_URL` is preferred; falls back to request origin only if the env var
is missing (dev / local). In production `APP_URL` MUST be set — without it,
Checkout success/cancel redirects will point at whatever host the API call hit
(could be a Vercel preview URL).

---

## 3. Stripe webhook URL registration

Each org's Stripe Dashboard must register a webhook endpoint at:

```
https://app.your-domain.com/api/webhooks/stripe?org_id=<the_org_uuid>
```

- Endpoint: must use the production `APP_URL` host, not a preview URL.
- Query param: `org_id` is required — the route returns 400 without it.
- Events to subscribe: `checkout.session.completed` and `payment_intent.succeeded`.
- Signing secret: paste the per-endpoint signing secret into
  `organizations.stripe_webhook_secret` for that org. The webhook route loads it
  by `org_id` and uses it for `stripe.webhooks.constructEvent`.

If the signing secret in the DB does not match the secret Stripe is signing with,
all webhook deliveries from that org's Stripe account will 400 with
`Webhook signature verification failed`.

---

## 4. Re-check after deploy

- [ ] `APP_URL` is set in production env
- [ ] Each connected org has `stripe_restricted_key` + `stripe_webhook_secret` populated
- [ ] Each connected org has a webhook endpoint registered in its Stripe Dashboard
      pointing at `${APP_URL}/api/webhooks/stripe?org_id=<uuid>`
- [ ] Test invoice → "Payment link" button → checkout completes → customer is
      returned to `${APP_URL}/invoices/<id>?paid=1`
- [ ] Test webhook signature: trigger `stripe trigger checkout.session.completed`
      against the production endpoint and confirm a `payments` row is inserted
      with `payment_method='stripe'` and the invoice status updates to `paid`

---

## 5. Related deferred work (not blocking deploy, but tracked)

- A nightly cron to flip eligible invoices from `sent`/`partially_paid` to
  `overdue` once `due_date < CURRENT_DATE` and `amount_due > 0`. UI already
  shows "Overdue" badges via `src/lib/utils/invoices.ts → isEffectivelyOverdue`
  regardless of stored status, so this cron is purely for the stored value /
  reporting consistency.
- A migration adding a partial unique index on
  `payments.stripe_payment_intent_id WHERE stripe_payment_intent_id IS NOT NULL`
  if it is not already in the database. The webhook performs an explicit
  duplicate check inside a `SELECT FOR UPDATE` transaction, so this index is
  belt-and-suspenders — not strictly required, but recommended.
- Outbox worker handlers for the new event types: `invoice.sent`, `invoice.paid`,
  `payment.recorded`. These events are emitted by this module but must be
  dispatched (SMS / email / in-app notification) by `outboxWorker.ts`.
