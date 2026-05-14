# Domain 7 — Revenue: Invoices & Payments

Tables: `invoices`, `invoice_line_items`, `payments`
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

## `payments`

Payment record against an invoice. **No soft delete. No `deleted_at`.** Payments are
immutable financial records. This table is the authoritative source of truth — not
`invoices.amount_paid`.

```sql
CREATE TABLE payments (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID NOT NULL REFERENCES organizations (id),
  invoice_id                  UUID NOT NULL REFERENCES invoices (id),
  amount                      NUMERIC(12,2) NOT NULL,
  payment_method              payment_method NOT NULL,
  stripe_payment_intent_id    TEXT,                          -- Null for non-Stripe payments.
  notes                       TEXT,
  recorded_by                 UUID REFERENCES org_members (id),  -- Null for Stripe webhook payments.
  paid_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
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
```

**Notes:**

- No `deleted_at`. No `updated_at`. Payments are financially immutable.
- `recorded_by` is NULL for Stripe webhook-created payments. Set for manually recorded payments (cash, check, etc.).
- Partial payment flow: when payment recorded, API recalculates `invoices.amount_paid` and `invoices.amount_due`, then transitions status: `amount_due > 0` → `partially_paid`; `amount_due = 0` → `paid`.
- `POST /api/invoices/[id]/record-payment` must lock the invoice row with `SELECT ... FOR UPDATE` and recalculate inside the same transaction.
