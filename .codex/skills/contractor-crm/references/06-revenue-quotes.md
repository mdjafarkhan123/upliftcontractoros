# Domain 6 — Revenue: Quotes

Tables: `quotes`, `quote_line_items`, `quote_views`, `quote_change_requests`, `quote_templates`, `quote_template_line_items`
Enums used: `quote_status`

---

## `quotes`

A priced proposal sent to a contact. `public_token_hash` is SHA-256 of the
public-facing access token. Quote validity is derived from business state — no
separate token expiry column.

```sql
CREATE TABLE quotes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations (id),
  contact_id          UUID NOT NULL REFERENCES contacts (id),
  opportunity_id      UUID REFERENCES opportunities (id),  -- Nullable. Quotes can exist without an opportunity.
  issued_by           UUID REFERENCES org_members (id),
  quote_number        INTEGER NOT NULL,                    -- Sequential per org. Never reused.
  title               TEXT NOT NULL,
  status              quote_status NOT NULL DEFAULT 'draft',
  subtotal            NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate            NUMERIC(5,4) NOT NULL DEFAULT 0,     -- Decimal: 0.0875 = 8.75%
  tax_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total               NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_required    BOOLEAN NOT NULL DEFAULT FALSE,
  deposit_amount      NUMERIC(12,2),
  deposit_paid_amount INTEGER NOT NULL DEFAULT 0,
  deposit_paid_at     TIMESTAMPTZ,
  deposit_stripe_payment_intent_id TEXT,
  deposit_applied_invoice_id UUID REFERENCES invoices (id) ON DELETE SET NULL,
  notes               TEXT,
  internal_notes      TEXT,
  public_token_hash   TEXT NOT NULL,                      -- SHA-256 hash only. Raw token never stored.
  expires_at          TIMESTAMPTZ,                        -- Nullable. Quote validity window.
  sent_at             TIMESTAMPTZ,
  viewed_at           TIMESTAMPTZ,                        -- First qualifying view only.
  accepted_at         TIMESTAMPTZ,
  declined_at         TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
-- Sequential number uniqueness. Soft-deleted quotes permanently consume their number.
CREATE UNIQUE INDEX idx_quotes_org_number
  ON quotes (org_id, quote_number);

-- Token hash lookup for public quote route.
CREATE UNIQUE INDEX idx_quotes_token_hash
  ON quotes (public_token_hash);

CREATE INDEX idx_quotes_org_id ON quotes (org_id);
CREATE INDEX idx_quotes_contact_id ON quotes (contact_id);
CREATE INDEX idx_quotes_opportunity_id ON quotes (opportunity_id);
CREATE INDEX idx_quotes_status ON quotes (org_id, status);

-- Idempotency guard for quote deposit Stripe webhooks.
CREATE UNIQUE INDEX idx_quotes_deposit_stripe_intent
  ON quotes (deposit_stripe_payment_intent_id)
  WHERE deposit_stripe_payment_intent_id IS NOT NULL;
```

**Notes:**

- Token validity checked at API layer using business state: invalid when `status IN ('accepted', 'declined', 'expired')` OR `deleted_at IS NOT NULL` OR `expires_at < now()`. No separate token expiry column.
- `public_token_hash` is UNIQUE without a partial index — globally unique regardless of soft-delete state.
- On re-send: new `public_token_hash` generated, old token immediately invalidated. Old links show "quote no longer available".
- `tax_rate` stored as decimal (0.0875), NOT percentage (8.75). Enforced at API layer.
- `total` is denormalized: `subtotal + tax_amount`. Recalculated when line items change.
- `deposit_paid_amount` is stored as INTEGER, distinct from `deposit_amount` (`NUMERIC(12,2)`).
- `deposit_stripe_payment_intent_id` has a partial unique index for Stripe webhook idempotency.
- `deposit_applied_invoice_id` is nullable and uses `ON DELETE SET NULL`. API logic must ensure the referenced invoice belongs to the same `org_id` as the quote.

**Token Lifecycle:**

1. Public links use cryptographically secure random tokens.
2. Only SHA-256 hash stored in DB. Raw token in client-facing URL.
3. On re-send: previous token invalidated, replaced with new token.
4. Old links display "quote no longer available".

---

## `quote_line_items`

Individual line items on a quote.

```sql
CREATE TABLE quote_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations (id),
  quote_id      UUID NOT NULL REFERENCES quotes (id),
  description   TEXT NOT NULL,
  quantity      NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(12,2) NOT NULL,
  total         NUMERIC(12,2) NOT NULL,            -- Denormalized: quantity * unit_price
  position      INTEGER NOT NULL DEFAULT 0,        -- Display order.
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_quote_line_items_quote_id ON quote_line_items (quote_id);
CREATE INDEX idx_quote_line_items_org_id ON quote_line_items (org_id);
```

---

## `quote_views`

Append-only view tracking log. No soft delete. No `updated_at`.

```sql
CREATE TABLE quote_views (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations (id),
  quote_id        UUID NOT NULL REFERENCES quotes (id),
  ip_hash         TEXT,
  user_agent_hash TEXT,
  viewed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  notification_sent       BOOLEAN NOT NULL DEFAULT FALSE,
  notification_sent_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_quote_views_quote_id ON quote_views (quote_id);
CREATE INDEX idx_quote_views_org_id ON quote_views (org_id);
```

**Notes:**

- Only the first qualifying view triggers the `quote.viewed` event and updates `quotes.viewed_at`. Subsequent views are logged but fire no event.
- Qualifying view logic (bot filtering, repeat-view throttle) enforced at API layer.
- **Privacy:** Raw IP and User-Agent strings are NEVER stored. Only SHA-256 hashes. Hashing at API layer before insertion.

---

## `quote_change_requests`

Active customer requests for quote changes. No soft delete.

```sql
ALTER TYPE quote_status ADD VALUE 'changes_requested';

CREATE TABLE quote_change_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  quote_id        UUID NOT NULL REFERENCES quotes (id) ON DELETE CASCADE,
  message         TEXT NOT NULL,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent more than one active (unresolved) change request per quote
CREATE UNIQUE INDEX idx_quote_change_requests_one_active
ON quote_change_requests (quote_id)
WHERE resolved_at IS NULL;

CREATE INDEX idx_quote_change_requests_quote_id ON quote_change_requests (quote_id);
CREATE INDEX idx_quote_change_requests_org_id ON quote_change_requests (org_id);

-- Enable RLS
ALTER TABLE public.quote_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_change_requests FORCE ROW LEVEL SECURITY;

-- SELECT policy
DROP POLICY IF EXISTS "quote_change_requests: members select own org requests"
  ON public.quote_change_requests;

CREATE POLICY "quote_change_requests: members select own org requests"
ON public.quote_change_requests
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());
```

---

## `quote_templates`

Reusable quote templates — pre-built line item sets.

```sql
CREATE TABLE quote_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations (id),
  name        TEXT NOT NULL,
  description TEXT,
  created_by    UUID REFERENCES org_members (id),
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_quote_templates_org_id ON quote_templates (org_id);
```

---

## `quote_template_line_items`

Line items on a quote template. Soft-deleted at application level when parent template
is soft-deleted. PostgreSQL CASCADE does not fire on `deleted_at`.

```sql
CREATE TABLE quote_template_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations (id),
  template_id   UUID NOT NULL REFERENCES quote_templates (id),
  description   TEXT NOT NULL,
  quantity      NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(12,2) NOT NULL,
  total         NUMERIC(12,2) NOT NULL,            -- Denormalized: quantity * unit_price
  position      INTEGER NOT NULL DEFAULT 0,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_quote_template_line_items_template_id
  ON quote_template_line_items (template_id);
CREATE INDEX idx_quote_template_line_items_org_id
  ON quote_template_line_items (org_id);
```

**Notes:**

- When a template is applied to a quote, line items are **copied** into `quote_line_items`. The quote's line items are fully independent after creation — template changes do not affect existing quotes.
