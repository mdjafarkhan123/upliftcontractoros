# Domain 7 — Revenue: Invoices & Payments

Tables: `invoices`, `invoice_line_items`, `invoice_views`, `payments`
Enums used: `invoice_status`, `payment_method`

---

## `invoices`

Payment request issued to a contact. `payments` table is the authoritative source of
truth for financial state. `amount_paid` and `amount_due` are denormalized convenience
values only — never trusted for financial logic.

```sql
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations (id),
  contact_id      UUID NOT NULL REFERENCES contacts (id),
  job_id          UUID REFERENCES jobs (id),       -- Nullable. Invoices can exist without a job.
  opportunity_id  UUID REFERENCES opportunities (id),
  quote_id        UUID REFERENCES quotes (id),
  issued_by       UUID REFERENCES org_members (id),
  invoice_number  INTEGER NOT NULL,                -- Sequential per org. Never reused.
  title           TEXT NOT NULL,
  status          invoice_status NOT NULL DEFAULT 'draft',
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate        NUMERIC(5,4) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid     NUMERIC(12,2) NOT NULL DEFAULT 0,   -- DENORMALIZED. Sum of payments.
  amount_due      NUMERIC(12,2) NOT NULL DEFAULT 0,   -- DENORMALIZED. total - amount_paid.
  notes           TEXT,
  public_token_hash       TEXT,                           -- SHA-256 of public token. Nullable for pre-migration rows.
  viewed_at               TIMESTAMPTZ,                    -- Set on first qualifying view. NULL until viewed.
  due_date        DATE,
  stripe_payment_link_url TEXT,
  sent_at         TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,                        -- Set when status transitions to 'paid'.
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
-- Numbers are never reused, even after soft delete.
CREATE UNIQUE INDEX idx_invoices_org_number
  ON invoices (org_id, invoice_number);

CREATE INDEX idx_invoices_org_id ON invoices (org_id);
CREATE INDEX idx_invoices_contact_id ON invoices (contact_id);
CREATE INDEX idx_invoices_job_id ON invoices (job_id);
CREATE INDEX idx_invoices_status ON invoices (org_id, status);
CREATE INDEX idx_invoices_due_date ON invoices (org_id, due_date);

-- Token lookup for the public /pay/:token route. Partial: NULL hashes excluded.
CREATE UNIQUE INDEX idx_invoices_token_hash
  ON invoices (public_token_hash)
  WHERE public_token_hash IS NOT NULL;

-- Quote → Invoice conversion deduplication guard.
-- One active (non-cancelled, non-deleted) invoice per source quote.
CREATE UNIQUE INDEX idx_invoices_quote_conversion
  ON invoices (quote_id)
  WHERE quote_id    IS NOT NULL
    AND deleted_at  IS NULL
    AND status      != 'cancelled';
```

**Invoice Status Transition Rules:**

```
draft          → sent            (invoice sent to contact)
sent           → partially_paid  (first payment received, balance > 0)
sent           → paid            (single full payment received)
sent           → overdue         (due_date passed, no payment — nightly cron)
partially_paid → paid            (final payment clears balance)
partially_paid → overdue         (due_date passed, balance outstanding — cron)
overdue        → paid            (late payment received)
overdue        → partially_paid  (partial late payment received)
any            → cancelled       (manual cancellation by Admin)
```

---

## `invoice_line_items`

Individual line items on an invoice.

```sql
CREATE TABLE invoice_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations (id),
  invoice_id    UUID NOT NULL REFERENCES invoices (id),
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
CREATE INDEX idx_invoice_line_items_invoice_id ON invoice_line_items (invoice_id);
CREATE INDEX idx_invoice_line_items_org_id ON invoice_line_items (org_id);
```

---

## `invoice_views`

Invoice view tracking table. Rows are inserted once and may receive a single update after
notification dispatch state changes. No soft delete. No `updated_at` (tracking table).
Only the first qualifying view triggers the `invoice.viewed` event and sets
`invoices.viewed_at`. All views are logged here regardless.
Qualifying view logic (bot filtering, self-view exclusion, 60-second throttle) is
enforced at the API layer, not the schema.
Privacy: raw IP and User-Agent are never stored — SHA-256 hashes only.

```sql
CREATE TABLE invoice_views (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL REFERENCES organizations (id),
  invoice_id            UUID        NOT NULL REFERENCES invoices (id),
  ip_hash               TEXT,                          -- SHA-256 hash. Raw IP never stored.
  user_agent_hash       TEXT,                          -- SHA-256 hash. Raw UA never stored.
  viewed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  notification_sent     BOOLEAN     NOT NULL DEFAULT FALSE,
  notification_sent_at  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_invoice_views_invoice_id
  ON invoice_views (invoice_id);

CREATE INDEX idx_invoice_views_org_id
  ON invoice_views (org_id);
```

**RLS:**

```sql
ALTER TABLE invoice_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_views FORCE  ROW LEVEL SECURITY;

CREATE POLICY "invoice_views: members select own org invoice views"
ON invoice_views
FOR SELECT
TO authenticated
USING (org_id = public.get_my_org_id());
```

**Notes:**

- `ip_hash` and `user_agent_hash` are SHA-256 hashes. Raw IP and User-Agent are never stored.
- All inserts flow through service role (API layer). Members can only SELECT own-org rows.
- `notification_sent` tracks whether the contractor has been notified of this view.
- Mirrors `quote_views` structure and mechanics.

---

## `payments`

Append-only payment ledger against an invoice. **No soft delete. No `deleted_at`.**
Payment rows are immutable financial records. Corrections, refunds, failed-payment
reversals, and voids are represented as NEW ledger rows, never by editing or deleting
the original payment. This table is the authoritative source of truth — not
`invoices.amount_paid`.

```sql
CREATE TABLE payments (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID NOT NULL REFERENCES organizations (id),
  invoice_id                  UUID NOT NULL REFERENCES invoices (id),
  amount                      NUMERIC(12,2) NOT NULL,
  adjustment_type             payment_adjustment_type NOT NULL DEFAULT 'payment',
  applies_to_payment_id       UUID REFERENCES payments (id),
  payment_method              payment_method NOT NULL,
  stripe_payment_intent_id    TEXT,                          -- Null for non-Stripe payments.
  notes                       TEXT,
  recorded_by                 UUID REFERENCES org_members (id),  -- Null for Stripe webhook payments.
  paid_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  receipt_sent_at             TIMESTAMPTZ,                    -- When receipt was dispatched. NULL = not sent.
  receipt_sent_via            TEXT CHECK (receipt_sent_via IN ('email', 'sms', 'both')),  -- Channel used.
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
-- Stripe idempotency. Prevents duplicate webhook processing.
CREATE UNIQUE INDEX idx_payments_stripe_intent
  ON payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX idx_payments_invoice_id ON payments (invoice_id);
CREATE INDEX idx_payments_org_id ON payments (org_id);
CREATE INDEX idx_payments_applies_to_payment_id ON payments (applies_to_payment_id);
```

**Notes:**

- No `deleted_at`. No `updated_at`. Payments are financially immutable.
- `adjustment_type = 'payment'` rows are positive money received.
- Refunds/corrections/failed-payment reversals/voids are inserted as negative `amount`
  rows with `applies_to_payment_id` pointing to the original payment.
- Never let reversal rows make net `SUM(amount)` or net `SUM(tip_amount)` negative.
- `recorded_by` is NULL for Stripe webhook-created payments. Set for manually recorded payments (cash, check, etc.).
- `receipt_sent_at` and `receipt_sent_via` are audit fields — never business-logic anchors.
- Partial payment flow: when payment recorded, API recalculates `invoices.amount_paid` and `invoices.amount_due`, then transitions status: `amount_due > 0` → `partially_paid`; `amount_due = 0` → `paid`.
- `POST /api/invoices/[id]/record-payment` must lock the invoice row with `SELECT ... FOR UPDATE` and recalculate inside the same transaction.
