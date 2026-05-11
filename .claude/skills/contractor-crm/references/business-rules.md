# Business Rules Reference

Cross-reference: Core Schema Design v1, Master Domain Architecture v1, Blueprint v3.

---

## Table of Contents

1. Organization Lifecycle
2. Contact Rules
3. Pipeline & Opportunities
4. Job Rules
5. Communication Rules
6. Quote Lifecycle
7. Invoice & Payment Rules
8. Appointment Rules
9. Reputation (Review Funnel) Rules
10. Media Rules
11. Growth Feed & Activity Log
12. Core Business Flow (End-to-End Data Trail)
13. Relationship Map (FK Reference)

---

## 1. Organization Lifecycle

**Status enum:** `active | suspended | pending_deletion | deleted`

```
active → suspended → pending_deletion → deleted
```

- Every org is created by the Platform Owner via `/jafar`
- `slug` is unique across the platform
- `twilio_phone_number` is unique — one number per org
- `is_setup_complete` gates the contractor app UI — set TRUE by Platform Owner when onboarding finishes
- `suspended`: app access locked, data retained
- `pending_deletion`: deletion occurs 7 days after scheduling (nightly cron)
- `deleted`: all org data permanently and irreversibly removed by cron

**Org Deletion Cascade Order** (must respect FK constraints):
```
automation_jobs → outbox_events → notifications → automation_settings →
internal_activity_log → growth_feed_items → media → private_feedback →
reviews → review_requests → payments → invoice_line_items → invoices →
quote_views → quote_line_items → quotes → quote_template_line_items →
quote_templates → messages → conversations → appointments → jobs →
opportunities → pipeline_stages → contact_notes → contact_addresses →
contacts → org_members → org_counters → organizations
```

Before initiating the cascade, all pending outbox events for the org must be set to
`status = 'cancelled'` so the outbox worker does not process them during deletion.

`org_members` rows are NEVER hard-deleted in normal operation — soft delete only.
During the final org deletion cron, they are hard-deleted as part of the cascade.

---

## 2. Contact Rules

**Status enum:** `lead | customer | archived`

```
lead → customer   (automatic when any opportunity for this contact reaches Won stage)
lead → archived   (manual)
customer → archived (manual)
```

**Key rules:**
- Phone is the dedup key: `UNIQUE(org_id, phone)`, E.164 format, enforced at write time
- Phone uniqueness survives soft delete — deleted contacts permanently block their number
- When new activity arrives with an existing phone: link to existing contact, alert assigned member, never silently merge or duplicate
- `email` is optional; `phone` is NOT NULL
- `tags` is `text[]` — no separate tags table
- `lead_source` enum: `website_form | live_chat | missed_call | manual | referral | other`
- `sms_opt_out` + `sms_opt_out_source` set automatically by Twilio webhook handler on STOP keywords
- `notes` field is for short notes; long notes go in `contact_notes` table
- Contacts belong to the org, not to individual members — assignment is operational

**Contact Addresses:**
- Separate `contact_addresses` table — no address fields on contacts
- Max one primary per contact: partial unique index `UNIQUE(contact_id) WHERE is_primary = TRUE AND deleted_at IS NULL`
- "At least one primary" enforced at application level only
- `label` enum: `billing | service | mailing | other`
- When a job is created, the contact's primary service address is snapshot-copied into the job

---

## 3. Pipeline & Opportunities

### Pipeline Stages

**Special stage flags:** `is_default`, `is_won`, `is_lost` — mutually exclusive on a single row.

Enforced by partial unique indexes (not application logic alone):
- Exactly one `is_default = TRUE` per org (among active stages)
- Exactly one `is_won = TRUE` per org (among active stages)
- Exactly one `is_lost = TRUE` per org (among active stages)
- Unique `position` per org among active stages

**Default seed (created on org creation):**
```
1. New Lead        (is_default = true)
2. Contacted
3. Estimate Scheduled
4. Quoted
5. Follow-Up
6. Won             (is_won = true)
7. Lost            (is_lost = true)
```

**Rules:**
- A stage cannot be soft-deleted while live opportunities (`deleted_at IS NULL`) reference it — enforced at API layer before setting `deleted_at`
- Stages are soft-deleted only, never hard-deleted
- Reordering positions must be transactional
- One pipeline per org in v1 — no `pipeline_id` column

### Opportunities

**Lifecycle:**
```
Created in default stage → moves through stages (drag and drop)
→ Reaches Won stage: job created automatically, closed_at set, contact.status → 'customer'
→ Reaches Lost stage: lost_reason recorded, closed_at set
```

- `value` is an estimate — actual revenue lives on invoices
- `assigned_to` is nullable, preserved on member deactivation

---

## 4. Job Rules

**Status enum:** `scheduled | in_progress | completed | cancelled`

```
scheduled → in_progress → completed
                        → cancelled
```

**Critical rules:**
- Jobs are NEVER created manually — always and only from a Won opportunity
- `opportunity_id` is NOT NULL and UNIQUE — one job per opportunity, ever
- `UNIQUE(opportunity_id)` is a hard constraint (not partial index) — prevents duplicates from concurrent Won transitions, webhook retries, and automation replays
- `contact_id` is denormalized at creation and never updated
- Service address fields are a snapshot: copied from contact's primary service address at creation, independently immutable. If contact's address changes later, job address is unaffected
- Service address fields are nullable — handles edge case where contact has no address at creation
- When `status → completed`: `job.completed` event emitted → review funnel triggered
- `scheduled_start` / `scheduled_end` represent the planned window; appointments handle visit-level scheduling

---

## 5. Communication Rules

### Conversations

**Channel enum:** `sms | missed_call | email | webchat`
**Status enum:** `open | closed | archived`

- One active conversation per contact per channel — enforced by partial unique index: `UNIQUE(contact_id, channel) WHERE deleted_at IS NULL AND status = 'open'`
- `last_message_at` updated on every new message (inbox sort key)
- `unread_count` increments on inbound, resets to 0 when team member opens conversation
- `unread_count` is denormalized — reconcile by counting `messages WHERE direction = 'inbound' AND read_at IS NULL` if drift detected
- `tags` is `text[]`
- When contact opts out of SMS: conversation remains visible, UI shows opt-out banner, send button disabled. Conversation is NOT automatically closed

### Messages

**Channel enum:** `sms | email | webchat` (no `missed_call` — that's conversation-level)
**Direction enum:** `inbound | outbound`
**Status enum:** `sent | delivered | failed | received | queued | bounced`

- `queued` and `bounced` reserved for future email channel — no v1 logic uses them
- `body` is nullable — missed call channel entries have no body
- `is_internal_note = true` messages are never sent externally
- `sent_by` is NULL for inbound messages and automation-sent messages
- `twilio_message_sid` has a partial unique index (WHERE NOT NULL) — prevents duplicate webhook processing
- Messages are never deleted — immutable communication record

---

## 6. Quote Lifecycle

**Status enum:** `draft | sent | viewed | accepted | declined | expired`

```
draft → sent → viewed → accepted
                      → declined
             → expired
```

**Critical rules:**
- `opportunity_id` is OPTIONAL — quotes can exist without a pipeline opportunity
- QUOTE ACCEPTANCE DOES NOT AUTO-ADVANCE THE OPPORTUNITY OR CREATE A JOB
  - Acceptance fires `quote.accepted` event → contractor receives notification
  - Staff manually moves opportunity to Won when operationally ready (deposit cleared, materials confirmed, scheduling confirmed)
  - This prevents premature job creation
- `quote_number` is org-scoped sequential: `UNIQUE(org_id, quote_number)` — never reused even after soft delete
- `public_token_hash` stores SHA-256 only — raw token never stored in DB
- Token validity is derived from business state at API layer: invalid when `status IN ('accepted', 'declined', 'expired') OR deleted_at IS NOT NULL OR expires_at < now()`
- On re-send: new `public_token_hash` generated, old token immediately invalidated, old links show "quote no longer available"
- `tax_rate` is stored as decimal (0.0875), not percentage (8.75)
- `total` is denormalized: `subtotal + tax_amount` — recalculate when line items change
- `deposit_required` boolean + `deposit_amount` numeric (nullable)

**Quote Templates:**
- Applying a template COPIES line items into `quote_line_items` — no FK back to template
- After creation, the quote is fully independent of the template
- When a template is soft-deleted, its `quote_template_line_items` are also soft-deleted in the same transaction (application-level, not PostgreSQL cascade)

**Quote Views:**
- Only the first qualifying view triggers the `quote.viewed` event and sets `quotes.viewed_at`
- Subsequent views are logged in `quote_views` but fire no event
- Bot filtering and repeat-view throttle (60s from same `ip_hash`) enforced at API layer
- Raw IP and User-Agent never stored — only SHA-256 hashes
- `notification_sent` boolean tracks whether the alert was dispatched

---

## 7. Invoice & Payment Rules

### Invoice Lifecycle

**Status enum:** `draft | sent | partially_paid | paid | overdue | cancelled`

```
draft          → sent
sent           → partially_paid   (first payment, balance > 0)
sent           → paid             (single full payment)
sent           → overdue          (due_date passed, no payment — nightly cron)
partially_paid → paid             (final payment clears balance)
partially_paid → overdue          (due_date passed, balance outstanding — cron)
overdue        → paid             (late payment)
overdue        → partially_paid   (partial late payment)
any            → cancelled        (manual by Admin only)
```

**Key rules:**
- `job_id`, `opportunity_id`, `quote_id` are all OPTIONAL
- `payments` table is the authoritative source of truth for all financial balances
- `amount_paid` and `amount_due` are denormalized convenience values ONLY — never mutate directly, always derive from `SUM(payments.amount)`
- `invoice_number` is org-scoped sequential: `UNIQUE(org_id, invoice_number)` — never reused
- `stripe_payment_link_url` stores the Stripe Payment Link for online payment
- When `amount_due = 0`: `status → paid`, `paid_at` set, `invoice.paid` event emitted

### Payment Recording (Critical Transaction Pattern)

```sql
BEGIN;
  -- 1. Lock the invoice row to prevent concurrent payment races
  SELECT * FROM invoices WHERE id = $invoice_id FOR UPDATE;

  -- 2. Insert the payment (immutable — never edited after)
  INSERT INTO payments (org_id, invoice_id, amount, payment_method, ...) VALUES (...);

  -- 3. Recalculate invoice totals from payments
  UPDATE invoices SET
    amount_paid = (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = $invoice_id),
    amount_due  = total - (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = $invoice_id),
    status      = CASE
      WHEN amount_due = 0 THEN 'paid'
      WHEN amount_due > 0 AND amount_paid > 0 THEN 'partially_paid'
      ELSE status
    END,
    paid_at     = CASE WHEN amount_due = 0 THEN now() ELSE paid_at END
  WHERE id = $invoice_id;

  -- 4. Insert outbox event (inside same transaction)
  INSERT INTO outbox_events (...) VALUES (...);
COMMIT;
```

- `stripe_payment_intent_id` has a UNIQUE partial index (WHERE NOT NULL) — Stripe webhook idempotency guard; duplicate webhook fires fail gracefully
- `recorded_by` is NULL for Stripe webhook payments, set for manual payments (cash, check, etc.)
- Payments are never deleted — no `deleted_at`, no `updated_at` — intentionally immutable
- Multiple payments per invoice are supported (partial payments and deposits)

### Sequential Number Generation Pattern

```sql
BEGIN;
  SELECT next_quote_number FROM org_counters WHERE org_id = $1 FOR UPDATE;
  UPDATE org_counters SET next_quote_number = next_quote_number + 1 WHERE org_id = $1;
  -- Use returned number for quotes.quote_number
COMMIT;
```

Counter values are never decremented. Always inside same transaction as quote/invoice creation.

---

## 8. Appointment Rules

**Type enum:** `estimate | job_start | follow_up | inspection | other`
**Status enum:** `scheduled | completed | cancelled | no_show`

**Key rules:**
- `job_id` is nullable — estimate appointments exist before a job is created
- `location` defaults from `job.service_address` when `job_id` present — independently editable
- `assigned_to` scopes Member visibility

**Reminder Reset on Reschedule (Rule 16):**
When `scheduled_start` is updated:
1. Set `reminder_24h_sent = FALSE` and `reminder_1h_sent = FALSE` in the same update
2. Cancel existing BullMQ reminder jobs
3. Re-create BullMQ reminder jobs for the new time

Failure to reset these flags silently prevents reminders from firing after reschedule.

---

## 9. Reputation (Review Funnel) Rules

### Review Requests

**Status enum:** `pending | sent | responded | failed | no_response`

```
pending → sent → responded
                 → score ≥ 4: reviews row created, Google review link sent
                 → score ≤ 3: private_feedback row created, contractor notified
        → failed
        → no_response
```

- Created by BullMQ when `job.completed` fires
- `UNIQUE(job_id)` is a hard constraint (not partial) — one review request per job, ever. Even if soft-deleted, no new one can be created for that job
- `response_score` is INTEGER 1–5 (nullable until responded)
- `sent_by_automation = TRUE` + `sent_by_member_id IS NULL` → automation-sent
- `sent_by_automation = FALSE` + `sent_by_member_id IS NOT NULL` → manually sent

### Reviews (Positive: score ≥ 4)

- `score` CHECK constraint: `score >= 4 AND score <= 5`
- Immutable — never deleted, no `deleted_at`
- `google_review_link_sent` tracks whether the Google review URL was delivered
- `platform`: `google | facebook | other`

### Private Feedback (Negative: score ≤ 3)

- `score` CHECK constraint: `score >= 1 AND score <= 3`
- Visible to Admin and Manager only (via `can_view_negative_feedback` permission)
- `is_resolved` set manually by Admin/Manager after addressing complaint
- `body` is immutable after submission

---

## 10. Media Rules

- Database stores metadata only — actual files in Cloudflare R2
- On upload: Sharp processes server-side → three R2 objects (original, thumbnail 300px, web 1200px) → one `media` row
- CHECK constraint: at least one parent FK must be set: `job_id IS NOT NULL OR quote_id IS NOT NULL OR invoice_id IS NOT NULL`
- `purpose_tag = 'quote_attachment'` requires `quote_id` to be set
- `purpose_tag = 'invoice_attachment'` requires `invoice_id` to be set
- `purpose_tag = 'marketing_asset'` makes file available to agency for GBP/social
- On soft delete: R2 objects deleted by outbox worker post-commit side effect; media row retained for audit
- `media_type` enum: `photo | pdf | attachment`
- `purpose_tag` enum: `job_photo | before | after | marketing_asset | quote_attachment | invoice_attachment`

---

## 11. Growth Feed & Activity Log

### Growth Feed Items

- Contractor-visible, read-only — no contractor API route allows writes
- Currently written by agency team directly into database (until Agency App built)
- Never deleted — permanent record of agency work
- `type` enum: `gbp_post | seo | social | website | blog | review_response | monthly_summary`
- `is_monthly_summary = TRUE` items generated by cron on first day of each month, aggregating: review count, rating delta, lead count, revenue collected, items published, milestones

### Internal Activity Log

- Agency-internal ONLY — never visible to contractors under any circumstances
- No RLS policy ever grants contractor access
- Not exposed via any Contractor App API route
- `author_id` is agency staff identifier (TEXT), not an `org_members` UUID
- Append-only — no `updated_at`, no `deleted_at`

### Notifications

- Per org member; driven by Supabase Realtime
- `resource_type` + `resource_id` are polymorphic navigation references — UI must handle gracefully if referenced entity is soft-deleted
- Purged at 90 days by nightly cron — unread notifications included in purge
- `idempotency_key` is NULLABLE: set for deduplicable events (e.g. `quote_viewed:{quote_id}:{member_id}`), NULL for repeatable notifications (reminders). Partial unique index blocks duplicates when key is set

---

## 12. Core Business Flow (End-to-End Data Trail)

```
1.  LEAD ARRIVES
    contacts created (status='lead') + conversations created + opportunities created
    (stage=default) + notification (type='new_lead') + automation_jobs
    (type='speed_to_lead') → SMS fires

2.  COMMUNICATION
    messages appended → conversations.last_message_at updated →
    conversations.unread_count managed

3.  APPOINTMENT BOOKED
    appointments created (job_id=null) + automation_jobs (type='appointment_reminder')
    + notification (type='appointment_booked')

4.  QUOTE SENT
    quotes created (draft→sent) + quote_line_items + opportunities.stage_id advanced
    to Quoted + automation_jobs (type='quote_followup')

5.  QUOTE VIEWED
    quote_views row + notification (type='quote_viewed')
    Followup automation cancelled if qualifying view

6.  QUOTE ACCEPTED
    quotes.status='accepted' + quote.accepted event + followup automation cancelled
    NOTE: Does NOT auto-create job or move opportunity

7.  OPPORTUNITY WON (manual by staff)
    opportunity moved to Won stage + closed_at set + jobs row created
    (opportunity_id, contact_id copied) + contacts.status='customer'
    + appointments.job_id linked if estimate exists

8.  INVOICE SENT
    invoices created (from quote or fresh) + invoice_line_items
    + automation_jobs (type='invoice_reminder') if overdue

9.  PAYMENT RECEIVED
    payments row + invoices.amount_paid/amount_due recalculated (with row lock)
    + if amount_due=0: status='paid', invoice.paid event
    + reminder automation cancelled + notification (type='payment_received')

10. JOB COMPLETED
    jobs.status='completed' + completed_at set + job.completed event
    + automation_jobs (type='review_request')

11. REVIEW FUNNEL
    review_requests created (pending→sent) → contact responds:
    score ≥ 4: reviews row + Google link delivered
    score ≤ 3: private_feedback row + contractor notified

12. GROWTH VISIBLE
    growth_feed_items inserted by agency → contractor reads Growth Feed
```

---

## 13. Relationship Map (FK Reference)

```
organizations
├── org_members             (one-to-many)
├── automation_settings     (one-to-one)
├── org_counters            (one-to-one)
├── pipeline_stages         (one-to-many)
├── quote_templates         (one-to-many)
│   └── quote_template_line_items (one-to-many)
├── contacts                (one-to-many)
│   ├── contact_addresses   (one-to-many)
│   ├── contact_notes       (one-to-many)
│   ├── opportunities       (one-to-many)
│   │   └── jobs            (one-to-one, UNIQUE)
│   │       ├── media            (one-to-many)
│   │       ├── appointments     (one-to-many, nullable job_id)
│   │       ├── invoices         (one-to-many, nullable job_id)
│   │       └── review_requests  (one-to-one, UNIQUE)
│   │           ├── reviews           (one-to-one)
│   │           └── private_feedback  (one-to-one)
│   ├── conversations       (one-to-many)
│   │   └── messages        (one-to-many)
│   ├── quotes              (one-to-many)
│   │   ├── quote_line_items (one-to-many)
│   │   ├── quote_views      (one-to-many)
│   │   └── media            (one-to-many, nullable, quote_attachment)
│   ├── invoices            (one-to-many)
│   │   ├── invoice_line_items (one-to-many)
│   │   ├── payments           (one-to-many)
│   │   └── media              (one-to-many, nullable, invoice_attachment)
│   └── appointments        (one-to-many)
├── growth_feed_items       (one-to-many)
├── internal_activity_log   (one-to-many)
├── notifications           (one-to-many)
├── automation_jobs         (one-to-many)
└── outbox_events           (one-to-many, nullable org_id for platform events)
```

**Optional FKs (nullable by design):**
- `quotes.opportunity_id` — quotes can exist without an opportunity
- `invoices.job_id` — invoices can exist without a job
- `invoices.opportunity_id` — invoices can exist without an opportunity
- `invoices.quote_id` — invoices can exist without originating from a quote
- `appointments.job_id` — estimate appointments exist before a job
- `media.job_id / quote_id / invoice_id` — at least one must be set (CHECK constraint)
- `outbox_events.org_id` — null for platform-level events

**Assignment FKs (all reference `org_members.id`, all nullable, all preserved on deactivation):**
`contacts.assigned_to`, `opportunities.assigned_to`, `jobs.assigned_to`,
`conversations.assigned_to`, `appointments.assigned_to`
