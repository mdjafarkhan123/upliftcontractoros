# Domain 2 — Contacts

Tables: `contacts`, `contact_addresses`, `contact_notes`
Enums used: `contact_status`, `address_label`, `lead_source_type`

---

## Known gaps (as of 2026-05-28)

- **`next_follow_up_at` reminder — BUILT (2026-05-29).** The `follow-up-due-sweep` cron (`src/lib/server/cron/followUpDueSweep.ts`, every 15 min) claims contacts where `next_follow_up_at <= now()` that are active and **assigned**, clears the field in the same transaction, and emits `contact.follow_up_due`. The outbox worker routes it to the notification queue → in-app notification to the assigned member (deep-link `/contacts/{id}`, type `contact_follow_up_due`). Single-fire (field cleared on claim); re-dating arms a fresh reminder. Unassigned contacts are skipped (no recipient) and stay pending until assigned. In-app only — no SMS/email to the contractor by design.
- **No `referred_by_contact_id` self-FK.** `lead_source='referral'` exists but the referrer is not recorded.
- **No merge-duplicates flow.** Same-phone dedup on create is the only mechanism; same-person/different-phone is not handled.

---

## `contacts`

Unified lead and customer record. All contacts begin as leads.

```sql
CREATE TABLE contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations (id),
  full_name     TEXT NOT NULL,
  email         TEXT,                            -- Optional
  phone         TEXT NOT NULL,                  -- E.164. Required for SMS.
  tags          TEXT[] NOT NULL DEFAULT '{}',   -- Array. No separate tags table.
  status        contact_status NOT NULL DEFAULT 'lead',
  assigned_to   UUID REFERENCES org_members (id),  -- Nullable. Who is working this lead.
  sms_opt_out   BOOLEAN NOT NULL DEFAULT FALSE, -- TCPA compliance. Checked by all SMS workers.
  sms_opt_out_at TIMESTAMPTZ,
  sms_opt_out_source TEXT,                      -- e.g. 'customer_reply', 'manual', 'admin_override'
  sms_opted_in_at    TIMESTAMPTZ,               -- Set when contact re-activates via START/YES
  lead_source        lead_source_type NOT NULL DEFAULT 'manual',
  notes         TEXT,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
-- Phone uniqueness enforced even after soft delete. Deleted contacts must be
-- reactivated, not recreated. This is intentional.
CREATE UNIQUE INDEX idx_contacts_org_phone
  ON contacts (org_id, phone);

CREATE INDEX idx_contacts_org_id ON contacts (org_id);
CREATE INDEX idx_contacts_status ON contacts (org_id, status);
CREATE INDEX idx_contacts_tags ON contacts USING GIN (tags);
```

**Notes:**

- Phone uniqueness across ALL rows including soft-deleted. Prevents ambiguous re-entry.
- SMS opt-out set automatically by Twilio inbound webhook on keywords: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT.
- Re-opt-in on START or YES: resets `sms_opt_out` to FALSE, sets `sms_opted_in_at`, clears `sms_opt_out_source`.
- Contact status lifecycle: `lead → customer` (automatic when any opportunity for this contact is Won). `lead → archived` or `customer → archived` (manual).

---

## `contact_addresses`

Reusable addresses per contact. `is_primary` marks the default. Jobs snapshot from a
selected address at creation time.

```sql
CREATE TABLE contact_addresses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations (id),
  contact_id        UUID NOT NULL REFERENCES contacts (id),
  label             address_label NOT NULL DEFAULT 'service',
  address_line_1    TEXT NOT NULL,
  address_line_2    TEXT,
  city              TEXT NOT NULL,
  state             TEXT NOT NULL,
  zip               TEXT NOT NULL,
  is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
-- One primary address per contact at any time (active only).
CREATE UNIQUE INDEX idx_contact_addresses_primary
  ON contact_addresses (contact_id)
  WHERE is_primary = TRUE AND deleted_at IS NULL;

CREATE INDEX idx_contact_addresses_contact_id
  ON contact_addresses (contact_id);

CREATE INDEX idx_contact_addresses_org_id
  ON contact_addresses (org_id);
```

---

## `contact_notes`

Freeform notes authored by team members on a contact.

```sql
CREATE TABLE contact_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations (id),
  contact_id  UUID NOT NULL REFERENCES contacts (id),
  author_id   UUID NOT NULL REFERENCES org_members (id),  -- Preserved on member deactivation.
  content     TEXT NOT NULL,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_contact_notes_contact_id ON contact_notes (contact_id);
CREATE INDEX idx_contact_notes_org_id ON contact_notes (org_id);
```
