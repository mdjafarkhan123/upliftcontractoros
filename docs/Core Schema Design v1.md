# Core Schema Design v1

# Contractor Growth Operating System

> Last Updated: May 2026 | Status: Draft | Depends On: Master Domain Architecture v1, Event System Architecture v1, Roles & Access Matrix v2

---

# 0. Schema Design Principles

These rules govern every table in this document.

```
1. org_id is present on every entity — no exceptions.
   This is the tenant isolation column. RLS depends on it.

2. deleted_at is present on every major entity (see exceptions below).
   Soft delete is the default. Hard delete is never used outside of
   the org deletion cron sequence.

3. All permission booleans are NOT NULL — never three-state.
   TRUE or FALSE. NULL is not a valid permission value.

4. All monetary values are numeric(12,2) in USD.
   No currency field. v1 is USD only.

5. All phone numbers are E.164 format, enforced at write time.

6. All UUIDs are gen_random_uuid() by default.

7. created_at and updated_at are present on all tables.
   Exception: append-only log tables (quote_views, internal_activity_log,
   notifications) have created_at only.

8. Payments have no soft delete — financial immutability.
   Refunds are out of v1 scope.

9. Foreign keys that reference org_members preserve the row on
   member deactivation — assigned_to, author_id, sent_by, recorded_by
   are never nulled out. The member row itself is soft-deleted only.

10. Denormalized convenience values (invoice amount_paid, amount_due,
    conversation unread_count) are never trusted for financial or
    permission-critical logic. Source of truth is always the parent rows.
```

---

# 1. Enum Definitions

All enums defined before table definitions to avoid forward references.

```sql
-- Organization status
CREATE TYPE org_status AS ENUM ('active', 'suspended', 'pending_deletion', 'deleted');

-- Member role
CREATE TYPE member_role AS ENUM ('admin', 'manager', 'member');

-- Contact lifecycle status
CREATE TYPE contact_status AS ENUM ('lead', 'customer', 'archived');

-- Address label
CREATE TYPE address_label AS ENUM ('billing', 'service', 'mailing', 'other');

-- Lead source
CREATE TYPE lead_source_type AS ENUM ('website_form', 'live_chat', 'missed_call', 'manual', 'referral', 'other');

-- Media purpose tag
CREATE TYPE media_purpose_tag AS ENUM (
  'job_photo',
  'before',
  'after',
  'marketing_asset',
  'quote_attachment',
  'invoice_attachment'
);

-- Media type
CREATE TYPE media_type AS ENUM (
  'photo',
  'pdf',
  'attachment'
);

-- Job status
CREATE TYPE job_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- Conversation channel
CREATE TYPE conversation_channel AS ENUM ('sms', 'missed_call', 'email', 'webchat');

-- Message channel (messages within a conversation -- does NOT include missed_call)
CREATE TYPE message_channel AS ENUM ('sms', 'email', 'webchat');

-- Conversation status
CREATE TYPE conversation_status AS ENUM ('open', 'closed', 'archived');

-- Message direction
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');

-- Message delivery status
-- queued and bounced reserved for future email channel
CREATE TYPE message_status AS ENUM ('sent', 'delivered', 'failed', 'received', 'queued', 'bounced');

-- Quote lifecycle status
CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired');

-- Invoice lifecycle status
-- partially_paid: at least one payment received, balance still outstanding
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled');

-- Payment method
CREATE TYPE payment_method AS ENUM ('stripe', 'cash', 'check', 'bank_transfer', 'other');

-- Appointment type
CREATE TYPE appointment_type AS ENUM ('estimate', 'job_start', 'follow_up', 'inspection', 'other');

-- Appointment status
CREATE TYPE appointment_status AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');

-- Review request status
CREATE TYPE review_request_status AS ENUM ('pending', 'sent', 'responded', 'failed', 'no_response');

-- Automation job status
CREATE TYPE automation_job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

CREATE TYPE automation_job_type AS ENUM (
  'missed_call_textback',
  'speed_to_lead',
  'quote_followup',
  'invoice_reminder',
  'review_request',
  'appointment_reminder'
);


-- Outbox event status
CREATE TYPE outbox_event_status AS ENUM ('pending', 'processing', 'processed', 'failed', 'dead_lettered');

-- Growth feed item type
CREATE TYPE growth_feed_type AS ENUM (
  'gbp_post',
  'seo',
  'social',
  'website',
  'blog',
  'review_response',
  'monthly_summary'
);
```

- Lifecycle: `lead → customer` (automatic when any opportunity for this contact is Won).
  `lead → archived` or `customer → archived` (manual, e.g. contact no longer relevant).

---

# 2. Domain 1 — Organization & Identity

## `organizations`

Root tenant record. One row per contractor business.

```sql
CREATE TABLE organizations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,
  trade_type            TEXT NOT NULL,
  twilio_phone_number   TEXT NOT NULL,
  status                org_status NOT NULL DEFAULT 'active',
  plan                  TEXT NOT NULL DEFAULT 'starter',
  stripe_restricted_key   TEXT,           -- encrypted at rest via Supabase Vault
  stripe_publishable_key  TEXT,
  stripe_webhook_secret   TEXT,           -- encrypted at rest via Supabase Vault
  stripe_account_id       TEXT,           -- acct_xxx, display only
  stripe_connected_at     TIMESTAMPTZ,
  logo_url              TEXT,
  primary_color         TEXT,
  timezone              TEXT NOT NULL DEFAULT 'America/Chicago',
  address               TEXT,
  city                  TEXT,
  state                 TEXT,
  zip                   TEXT,
  suspended_at          TIMESTAMPTZ,
  deletion_scheduled_at TIMESTAMPTZ,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
-- Each Twilio phone number can belong to only one organization.
CREATE INDEX idx_organizations_status ON organizations (status);
CREATE UNIQUE INDEX idx_organizations_twilio_phone
ON organizations (twilio_phone_number);
```

**Notes:**

- `twilio_phone_number` is unique at the infrastructure level (Twilio account), also enforced by DB constraint. One number per org.
- Org deletion is handled by application-level cron in explicit FK-safe order across 30 tables. No PostgreSQL CASCADE on this table.

---

## `org_members`

All users within a contractor org — Admin, Manager, and Member. Contains role, profile, active status, and all 39 fine-grained permission booleans.

```sql
CREATE TABLE org_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations (id),
  supabase_user_id      UUID NOT NULL,           -- FK to auth.users (Supabase managed)
  email                 TEXT NOT NULL,           -- Denormalized from auth. READ-ONLY on this table.
  full_name             TEXT NOT NULL,
  avatar_url            TEXT,
  role                  member_role NOT NULL,    -- Coarse role. Used for template display only.
                                                 -- NEVER used for access control at runtime.
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ================================================================
  -- PERMISSION COLUMNS (39 total)
  -- All NOT NULL. TRUE or FALSE only. Never NULL.
  -- Admin rows: all seeded TRUE by application at creation.
  -- Manager/Member rows: seeded from role template, overridable.
  -- These are the SOLE source of truth for access control at API layer.
  -- ================================================================

  -- Module 1: Dashboard
  can_view_dashboard              BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_revenue                BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_pipeline_snapshot      BOOLEAN NOT NULL DEFAULT FALSE,

  -- Module 2: Inbox
  can_view_all_conversations      BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_assigned_conversations BOOLEAN NOT NULL DEFAULT FALSE,
  can_send_messages               BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete_conversations        BOOLEAN NOT NULL DEFAULT FALSE,

  -- Module 3: Contacts
  can_view_all_contacts           BOOLEAN NOT NULL DEFAULT FALSE,
  can_create_contacts             BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit_contacts               BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete_contacts             BOOLEAN NOT NULL DEFAULT FALSE,

  -- Module 4: Pipeline
  can_view_full_pipeline          BOOLEAN NOT NULL DEFAULT FALSE,
  can_move_pipeline_stages        BOOLEAN NOT NULL DEFAULT FALSE,
  can_create_opportunities        BOOLEAN NOT NULL DEFAULT FALSE,

  -- Module 5: Quotes
  can_view_all_quotes             BOOLEAN NOT NULL DEFAULT FALSE,
  can_create_quotes               BOOLEAN NOT NULL DEFAULT FALSE,
  can_send_quotes                 BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit_quotes                 BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete_quotes               BOOLEAN NOT NULL DEFAULT FALSE,

  -- Module 6: Invoices
  can_view_all_invoices           BOOLEAN NOT NULL DEFAULT FALSE,
  can_create_invoices             BOOLEAN NOT NULL DEFAULT FALSE,
  can_send_invoices               BOOLEAN NOT NULL DEFAULT FALSE,
  can_record_payments             BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete_invoices             BOOLEAN NOT NULL DEFAULT FALSE,

  -- Module 7: Appointments
  can_view_all_appointments       BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_assigned_appointments  BOOLEAN NOT NULL DEFAULT FALSE,
  can_create_appointments         BOOLEAN NOT NULL DEFAULT FALSE,
  can_reschedule_appointments     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Module 8: Reputation
  can_view_reviews                BOOLEAN NOT NULL DEFAULT FALSE,
  can_send_review_requests        BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_negative_feedback      BOOLEAN NOT NULL DEFAULT FALSE,

  -- Module 9: Growth Feed
  can_view_growth_feed            BOOLEAN NOT NULL DEFAULT FALSE,

  -- Module 10: Files & Media
  can_view_all_files              BOOLEAN NOT NULL DEFAULT FALSE,
  can_upload_files                BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete_files                BOOLEAN NOT NULL DEFAULT FALSE,

  -- Module 11: Team Management
  can_view_team_members           BOOLEAN NOT NULL DEFAULT FALSE,
  can_create_team_members         BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit_team_members           BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete_team_members         BOOLEAN NOT NULL DEFAULT FALSE
);
```

**Indexes:**

```sql
CREATE UNIQUE INDEX idx_org_members_supabase_user_id
  ON org_members (supabase_user_id);

CREATE UNIQUE INDEX idx_org_members_org_email
  ON org_members (org_id, email)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_org_members_org_id
  ON org_members (org_id);
```

**Notes:**

- DEFAULT FALSE on all permission columns is a safety net only. Application code seeds explicit TRUE/FALSE at creation — defaults should never be relied upon.
- `email` must never be updated directly on this table. All email changes flow through Supabase Auth and trigger a corresponding `org_members` update.
- `supabase_user_id` is globally unique — one Supabase auth identity can only belong to one org.
- `deleted_at` on org_members is used for deactivation. Rows are never hard-deleted.
- The Platform Owner has NO row in this table.

---

## `automation_settings`

One row per org. Controls all automation on/off switches and configuration.

```sql
CREATE TABLE automation_settings (
  id                                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                              UUID NOT NULL REFERENCES organizations (id),

  -- Missed Call Text-Back
  missed_call_textback_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  missed_call_textback_message        TEXT NOT NULL DEFAULT 'Hi! We missed your call. We''ll be in touch shortly — or reply here and we''ll get back to you right away.',

  -- Quote Follow-Up (two reminders)
  quote_followup_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  quote_followup_delay_1_hours        INTEGER NOT NULL DEFAULT 24,
  quote_followup_delay_2_hours        INTEGER NOT NULL DEFAULT 72,
  quote_followup_message              TEXT NOT NULL DEFAULT 'Hi {contact_name}, just following up on the quote we sent. Any questions? We''re happy to help.',

  -- Invoice Reminder
  invoice_reminder_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  invoice_reminder_delay_days         INTEGER NOT NULL DEFAULT 3,
  invoice_reminder_message            TEXT NOT NULL DEFAULT 'Hi {contact_name}, just a reminder that your invoice is due. Please don''t hesitate to reach out if you have any questions.',

  -- Review Funnel
  review_funnel_enabled               BOOLEAN NOT NULL DEFAULT TRUE,
  review_funnel_delay_hours           INTEGER NOT NULL DEFAULT 2,
  review_funnel_message               TEXT NOT NULL DEFAULT 'Hi {contact_name}, thank you for choosing us! How did we do today? Reply with a number from 1–5.',

  -- Appointment Reminder
  appointment_reminder_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  appointment_reminder_hours_before   INTEGER NOT NULL DEFAULT 24,
  appointment_reminder_message        TEXT NOT NULL DEFAULT 'Hi {contact_name}, just a reminder about your appointment tomorrow. Reply STOP to opt out.',


  -- Speed to Lead
  speed_to_lead_enabled               BOOLEAN NOT NULL DEFAULT TRUE,
  speed_to_lead_message               TEXT NOT NULL DEFAULT 'Hi {contact_name}, thanks for reaching out! We''ll get back to you shortly.',

  created_at                          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT now()
);


```

**Indexes:**

```sql
CREATE UNIQUE INDEX idx_automation_settings_org_id
  ON automation_settings (org_id);
```

**Notes:**

- Created automatically when a new org is created via `/jafar`. One row, one org, always.
- Message templates support `{contact_name}` and `{org_name}` interpolation tokens at send time.
- The same `quote_followup_message` template is used for both follow-up reminders.
  If unique messages per reminder are needed later, additional text columns can be added.

---

# 3. Domain 2 — Contacts

## `contacts`

Unified lead and customer record. All contacts begin as leads. `status` tracks the full lifecycle.

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
  sms_opt_out_source TEXT,                          -- e.g. 'customer_reply', 'manual', 'admin_override'
  sms_opted_in_at    TIMESTAMPTZ,                   -- Set when contact re-activates via START/YES
  lead_source        lead_source_type NOT NULL DEFAULT 'manual',
  notes         TEXT,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
-- Phone numbers are never reused, even after soft delete. Deleted contacts should be reactivated instead of recreated.
CREATE UNIQUE INDEX idx_contacts_org_phone
ON contacts (org_id, phone);

CREATE INDEX idx_contacts_org_id ON contacts (org_id);
CREATE INDEX idx_contacts_status ON contacts (org_id, status);
CREATE INDEX idx_contacts_tags ON contacts USING GIN (tags);
```

**Notes:**

- Phone uniqueness is enforced even after soft delete. A phone number soft-deleted with a contact remains blocked. This is intentional — prevents ambiguous re-entry of a known contact.
- `sms_opt_out` and `sms_opt_out_source` are set automatically by the Twilio inbound message webhook handler when a STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, or QUIT keyword is received. This is a Phase 1 requirement. If a contact later sends START or YES, `sms_opt_out` is reset to FALSE, `sms_opted_in_at` is set, and `sms_opt_out_source` is cleared, allowing communication to resume.

---

## `contact_addresses`

Reusable addresses per contact. A contact may have multiple addresses. `is_primary` marks the default. Jobs snapshot from a selected address at creation.

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
-- One primary address per contact at any time.
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

---

# 4. Domain 3 — Pipeline

## `pipeline_stages`

Configurable pipeline stages per org. Soft-deleted only — never hard-deleted. Partial unique indexes enforce business rules on special stages.

```sql
CREATE TABLE pipeline_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations (id),
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,                    -- Hex color code. e.g. '#3B82F6'
  position    INTEGER NOT NULL,                 -- Display order. App manages re-ordering.
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,   -- Starting stage for new opportunities.
  is_won      BOOLEAN NOT NULL DEFAULT FALSE,   -- Won terminal stage. Triggers job creation.
  is_lost     BOOLEAN NOT NULL DEFAULT FALSE,   -- Lost terminal stage.
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
-- Each org can only have one of each special stage type (active only).
CREATE UNIQUE INDEX idx_pipeline_stages_one_won
  ON pipeline_stages (org_id)
  WHERE is_won = TRUE AND deleted_at IS NULL;

-- Unique position per org among active stages
CREATE UNIQUE INDEX idx_pipeline_stages_position
  ON pipeline_stages (org_id, position)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_pipeline_stages_one_lost
  ON pipeline_stages (org_id)
  WHERE is_lost = TRUE AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_pipeline_stages_one_default
  ON pipeline_stages (org_id)
  WHERE is_default = TRUE AND deleted_at IS NULL;

CREATE INDEX idx_pipeline_stages_org_id
  ON pipeline_stages (org_id);
```

**Notes:**

- A stage cannot be soft-deleted while live opportunities (deleted_at IS NULL) reference it. Enforced at API layer before setting deleted_at.
- `is_won`, `is_lost`, `is_default` are mutually exclusive on a single row. Enforced at application layer.
- Stage positions must remain unique per organization.
  Reordering operations must occur transactionally.

---

## `opportunities`

A deal or potential job moving through the pipeline. The commercial record of intent before a job is created.

```sql
CREATE TABLE opportunities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations (id),
  contact_id    UUID NOT NULL REFERENCES contacts (id),
  stage_id      UUID NOT NULL REFERENCES pipeline_stages (id),
  title         TEXT NOT NULL,
  value         NUMERIC(12,2),                  -- Estimated deal value. Nullable — may be unknown.
  assigned_to   UUID REFERENCES org_members (id),  -- Nullable. Preserved on member deactivation.
  lost_reason   TEXT,                           -- Populated when moved to Lost stage.
  closed_at     TIMESTAMPTZ,                    -- Set when moved to Won or Lost stage.
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_opportunities_org_id ON opportunities (org_id);
CREATE INDEX idx_opportunities_contact_id ON opportunities (contact_id);
CREATE INDEX idx_opportunities_stage_id ON opportunities (stage_id);
CREATE INDEX idx_opportunities_assigned_to ON opportunities (assigned_to);
```

---

# 5. Domain 4 — Jobs

## `jobs`

Operational delivery entity. Always created from a Won opportunity. Never created independently. Service address is a point-in-time snapshot — historically immutable.

```sql
CREATE TABLE jobs (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID NOT NULL REFERENCES organizations (id),
  opportunity_id            UUID NOT NULL REFERENCES opportunities (id),
  contact_id                UUID NOT NULL REFERENCES contacts (id),
  title                     TEXT NOT NULL,
  status                    job_status NOT NULL DEFAULT 'scheduled',
  assigned_to               UUID REFERENCES org_members (id),   -- Nullable. Preserved on deactivation.
  notes                     TEXT,
  scope_of_work             TEXT,

  -- Service address snapshot. Copied at job creation. Never updated after.
  -- Nullable: handles edge case where contact has no address at job creation time.
  service_address_line_1    TEXT,
  service_address_line_2    TEXT,
  service_address_city      TEXT,
  service_address_state     TEXT,
  service_address_zip       TEXT,

  scheduled_start           TIMESTAMPTZ,
  scheduled_end             TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  cancelled_at              TIMESTAMPTZ,
  deleted_at                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
-- Structural idempotency guard: one job per opportunity, ever.
CREATE UNIQUE INDEX idx_jobs_opportunity_id
  ON jobs (opportunity_id);

CREATE INDEX idx_jobs_org_id ON jobs (org_id);
CREATE INDEX idx_jobs_contact_id ON jobs (contact_id);
CREATE INDEX idx_jobs_assigned_to ON jobs (assigned_to);
CREATE INDEX idx_jobs_status ON jobs (org_id, status);
CREATE INDEX idx_jobs_scheduled_start ON jobs (org_id, scheduled_start);
```

**Notes:**

- `UNIQUE(opportunity_id)` is a hard structural constraint — not a partial index. Duplicate job creation from concurrent Won transitions, webhook retries, and automation replays is structurally impossible.
- Service address fields are nullable to handle the case where a contact has no address at job creation time. Nulls here are a data quality issue, not a schema violation.
- `scheduled_start` / `scheduled_end` on jobs represent the planned window. Appointments linked via `job_id` handle the visit-level scheduling detail.

---

# 6. Domain 5 — Communication

## `conversations`

A unified communication thread with a contact. Only one open conversation per contact per channel is allowed. Enforced at the database level – duplicate inserts will fail gracefully.

```sql
CREATE TABLE conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations (id),
  contact_id       UUID NOT NULL REFERENCES contacts (id),
  channel          conversation_channel NOT NULL,
  status           conversation_status NOT NULL DEFAULT 'open',
  subject          TEXT,                          -- Nullable. Intended for future email threads.
  assigned_to      UUID REFERENCES org_members (id),  -- Nullable. Member scoped access anchor.
  last_message_at  TIMESTAMPTZ,                       -- Denormalized. Updated on every message.
  unread_count     INTEGER NOT NULL DEFAULT 0,        -- Denormalized. Reconcilable if drift detected.
  tags             TEXT[] NOT NULL DEFAULT '{}',
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_conversations_org_id ON conversations (org_id);
CREATE INDEX idx_conversations_contact_id ON conversations (contact_id);
CREATE INDEX idx_conversations_assigned_to ON conversations (assigned_to);
CREATE INDEX idx_conversations_status ON conversations (org_id, status);
CREATE INDEX idx_conversations_last_message_at ON conversations (org_id, last_message_at DESC);

CREATE UNIQUE INDEX idx_conversations_open_contact_channel
ON conversations (contact_id, channel)
WHERE deleted_at IS NULL
AND status = 'open';
```

**Notes:**

- `unread_count` is a denormalized convenience value. If drift is detected, reconcile by counting `messages WHERE direction = 'inbound' AND read_at IS NULL` for the conversation. Never trust for permission or financial logic.

---

## `messages`

Individual messages within a conversation — inbound or outbound.

```sql
CREATE TABLE messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations (id),
  conversation_id       UUID NOT NULL REFERENCES conversations (id),
  direction             message_direction NOT NULL,
  channel               message_channel NOT NULL,
  body                  TEXT,                           -- Nullable for missed call channel.
  is_internal_note      BOOLEAN NOT NULL DEFAULT FALSE,
  media_urls            TEXT[],
  status                message_status NOT NULL,
  twilio_message_sid    TEXT,                           -- Nullable for non-Twilio messages.
  sent_by               UUID REFERENCES org_members (id),  -- Null for automation-sent messages.
  sent_at               TIMESTAMPTZ,
  read_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE UNIQUE INDEX idx_messages_twilio_sid
  ON messages (twilio_message_sid)
  WHERE twilio_message_sid IS NOT NULL;

CREATE INDEX idx_messages_conversation_id ON messages (conversation_id);
CREATE INDEX idx_messages_org_id ON messages (org_id);
CREATE INDEX idx_messages_direction_read ON messages (conversation_id, direction, read_at);
```

**Notes:**

- `twilio_message_sid` uniqueness is a partial index (null values excluded). Prevents duplicate Twilio webhook processing.
- `queued` and `bounced` status values are reserved for future email channel support. No v1 logic uses them.
- `body` is nullable — missed call channel entries have no message body.

---

# 7. Domain 6 — Revenue

## `quotes`

A priced proposal sent to a contact. `public_token_hash` is the SHA-256 hash of the public-facing access token. Quote validity is derived from business state — no separate token expiry field.

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
  tax_rate            NUMERIC(5,4) NOT NULL DEFAULT 0,     -- e.g. 0.0875 = 8.75%
  tax_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total               NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_required    BOOLEAN NOT NULL DEFAULT FALSE,
  deposit_amount      NUMERIC(12,2),
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
```

**Notes:**

- Token validity is checked at the API layer using business state only: A quote token is **invalid** when: `status IN ('accepted', 'declined', 'expired')` OR `deleted_at IS NOT NULL` OR `expires_at < now()`. There is no separate token expiry column.
- `public_token_hash` is UNIQUE without a partial index — the hash is globally unique regardless of soft-delete state. When a quote is re-sent, a new `public_token_hash` is generated and the old token is immediately invalidated. Clients opening the old link will see a "quote no longer available" message.
- `tax_rate` is stored as a decimal (0.0875), not a percentage (8.75). Enforced at API layer.
- `total` is a denormalized computed value: `subtotal + tax_amount`. Always recalculated when line items change.

**Token Lifecycle:**

- Public quote links use cryptographically secure random tokens.
- Only the SHA-256 hash of the token is stored in the database.
- The client-facing URL contains the raw token.
- On re-send, the previous token is invalidated immediately and replaced with a new token.
- Old links display a "quote no longer available" message.

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

View tracking records for quote-viewed notifications. Append-only log. No soft delete. No updated_at.

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

- Only the first qualifying view triggers the `quote.viewed` event and updates `quotes.viewed_at`. Subsequent views are logged here but fire no event.
- Qualifying view logic (bot filtering, repeat-view throttle) is enforced at the API layer, not the schema.
- **Privacy:** Raw IP and User‑Agent strings are **never** stored. Only their one‑way SHA‑256 hashes are kept. Hashing is performed at the API layer before insertion.

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

Individual line items on a quote template. Soft-deleted at application level when parent template is soft-deleted. PostgreSQL CASCADE does not fire on deleted_at — application manages this.

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
CREATE INDEX idx_quote_template_line_items_template_id ON quote_template_line_items (template_id);
CREATE INDEX idx_quote_template_line_items_org_id ON quote_template_line_items (org_id);
```

**Notes:**

- When a template is applied to a quote, line items are **copied** into `quote_line_items`. The quote's line items are fully independent after creation — changes to the template do not affect existing quotes.

---

## `invoices`

A payment request issued to a contact. `payments` table is the authoritative source of truth for financial state. `amount_paid` and `amount_due` are denormalized convenience values only.

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
  amount_paid     NUMERIC(12,2) NOT NULL DEFAULT 0,   -- Denormalized. Sum of payments.
  amount_due      NUMERIC(12,2) NOT NULL DEFAULT 0,   -- Denormalized. total - amount_paid.
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
-- Quote and invoice numbers are never reused, even after soft delete
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
draft        → sent          (invoice sent to contact)
sent         → partially_paid (first payment received, balance > 0)
sent         → paid          (single full payment received)
sent         → overdue       (due_date passed, no payment — set by nightly cron sweep)
partially_paid → paid        (final payment clears balance)
partially_paid → overdue     (due_date passed, balance still outstanding — set by cron)
overdue      → paid          (late payment received)
overdue      → partially_paid (partial late payment received)
any          → cancelled     (manual cancellation by Admin)
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

A payment record against an invoice. **No soft delete.** Payments are immutable financial records. `payments` is the authoritative source of truth — not `invoices.amount_paid`.

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

- No `deleted_at`. Payments are financial records and must never be soft-deleted.
- `recorded_by` is NULL for Stripe webhook-created payments. Set for manually recorded payments (cash, check, etc.).
- Partial payment flow: when a payment is recorded, the API recalculates `invoices.amount_paid` and `invoices.amount_due`, then transitions status: if `amount_due > 0` → `partially_paid`; if `amount_due = 0` → `paid`.

---

# 8. Domain 7 — Appointments

## `appointments`

A scheduled visit, estimate, or meeting with a contact. May be linked to a job (job_id nullable). Reminder sent flags reset on every reschedule.

```sql
CREATE TABLE appointments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations (id),
  contact_id          UUID NOT NULL REFERENCES contacts (id),
  job_id              UUID REFERENCES jobs (id),           -- Nullable.
  assigned_to         UUID REFERENCES org_members (id),   -- Nullable. Member scoped access anchor.
  type                appointment_type NOT NULL,
  status              appointment_status NOT NULL DEFAULT 'scheduled',
  title               TEXT NOT NULL,
  scheduled_start     TIMESTAMPTZ NOT NULL,
  scheduled_end       TIMESTAMPTZ,
  location            TEXT,                               -- Defaults from job.service_address at API layer if job_id present. Independently editable.
  notes               TEXT,
  reminder_24h_sent   BOOLEAN NOT NULL DEFAULT FALSE,     -- Reset to FALSE on every reschedule.
  reminder_1h_sent    BOOLEAN NOT NULL DEFAULT FALSE,     -- Reset to FALSE on every reschedule.
  cancelled_at        TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_appointments_org_id ON appointments (org_id);
CREATE INDEX idx_appointments_contact_id ON appointments (contact_id);
CREATE INDEX idx_appointments_job_id ON appointments (job_id);
CREATE INDEX idx_appointments_assigned_to ON appointments (assigned_to);
CREATE INDEX idx_appointments_scheduled_start ON appointments (org_id, scheduled_start);
-- Worker polling index: find unsent reminders approaching scheduled time
CREATE INDEX idx_appointments_reminders
  ON appointments (scheduled_start)
  WHERE reminder_24h_sent = FALSE OR reminder_1h_sent = FALSE;
```

**Notes:**

- Reminder flag reset logic: when a reschedule occurs (`scheduled_start` changes), the API sets both `reminder_24h_sent = FALSE` and `reminder_1h_sent = FALSE` in the same update.
- `location` defaulting from job address is an API-layer concern, not a DB default.

---

# 9. Domain 8 — Reputation

## `review_requests`

A review request sent to a contact after job completion. One per job — structurally enforced.

```sql
CREATE TABLE review_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations (id),
  job_id                UUID NOT NULL REFERENCES jobs (id),
  contact_id            UUID NOT NULL REFERENCES contacts (id),
  status                review_request_status NOT NULL DEFAULT 'pending',
  sent_by_automation    BOOLEAN NOT NULL DEFAULT FALSE,
  sent_by_member_id     UUID REFERENCES org_members (id),  -- Null if sent by automation.
  response_score        INTEGER CHECK (response_score >= 1 AND response_score <= 5),
  sent_at               TIMESTAMPTZ,
  responded_at          TIMESTAMPTZ,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
-- One review request per job, ever. Retry duplicate guard.
CREATE UNIQUE INDEX idx_review_requests_job_id
  ON review_requests (job_id);

CREATE INDEX idx_review_requests_org_id ON review_requests (org_id);
CREATE INDEX idx_review_requests_contact_id ON review_requests (contact_id);
```

**Notes:**

- `UNIQUE(job_id)` is a hard constraint (not partial). Even if a review request is soft-deleted, no new one can be created for the same job. Enforced at application layer before attempting insert.
- `sent_by_automation = TRUE` and `sent_by_member_id IS NULL` → sent by BullMQ worker.
- `sent_by_automation = FALSE` and `sent_by_member_id IS NOT NULL` → manually sent by staff.

---

## `reviews`

A received review record — positive outcome of the review funnel (score ≥ 4).

```sql
CREATE TABLE reviews (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID NOT NULL REFERENCES organizations (id),
  job_id                    UUID NOT NULL REFERENCES jobs (id),
  contact_id                UUID NOT NULL REFERENCES contacts (id),
  review_request_id         UUID REFERENCES review_requests (id),
  score                     INTEGER NOT NULL CHECK (score >= 4 AND score <= 5),
  platform                  TEXT,                        -- 'google', 'facebook', 'other'
  body                      TEXT,
  review_url                TEXT,                        -- public review link
  google_review_link_sent   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_reviews_org_id ON reviews (org_id);
CREATE INDEX idx_reviews_job_id ON reviews (job_id);
CREATE INDEX idx_reviews_contact_id ON reviews (contact_id);
```

---

## `private_feedback`

Private negative feedback — captured before it can become a public review (score ≤ 3). Visible only to Admin and Manager. Never visible to the contact.

```sql
CREATE TABLE private_feedback (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations (id),
  job_id              UUID NOT NULL REFERENCES jobs (id),
  contact_id          UUID NOT NULL REFERENCES contacts (id),
  review_request_id   UUID REFERENCES review_requests (id),
  score               INTEGER NOT NULL CHECK (score >= 1 AND score <= 3),
  body                TEXT,
  is_resolved         BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by         UUID REFERENCES org_members (id),
  resolved_at         TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_private_feedback_org_id ON private_feedback (org_id);
CREATE INDEX idx_private_feedback_job_id ON private_feedback (job_id);
```

---

# 10. Domain 9 — Files & Media

## `media`

All org media — job photos, attachments, marketing assets. Stores metadata only. Actual files live in Cloudflare r2 Storage.

```sql
CREATE TABLE media (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations (id),
  uploaded_by         UUID REFERENCES org_members (id),
  job_id              UUID REFERENCES jobs (id),
  quote_id            UUID REFERENCES quotes (id),
  invoice_id          UUID REFERENCES invoices (id),
  r2_key              TEXT NOT NULL,
  thumbnail_key       TEXT,
  web_key             TEXT,
  original_filename   TEXT NOT NULL,
  file_size_bytes     INTEGER NOT NULL,
  media_type          media_type NOT NULL,
  mime_type           TEXT NOT NULL,
  purpose_tag         media_purpose_tag NOT NULL,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT media_must_have_parent CHECK (
    job_id IS NOT NULL
    OR quote_id IS NOT NULL
    OR invoice_id IS NOT NULL
  )
);
```

**Indexes:**

```sql
CREATE INDEX idx_media_org_id ON media (org_id);
CREATE INDEX idx_media_job ON media (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_media_quote ON media (quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX idx_media_invoice ON media (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_media_uploaded_by ON media (uploaded_by);
CREATE INDEX idx_media_purpose_tag ON media (org_id, purpose_tag);
```

**Notes:**

- On upload: Sharp processes server-side → three R2 objects created (original, thumbnail, web) → one `media` row inserted with all three keys.
- `purpose_tag = 'quote_attachment'` requires `quote_id` to be set.
- `purpose_tag = 'invoice_attachment'` requires `invoice_id` to be set.
- `purpose_tag = 'marketing_asset'` makes the file available to agency for GBP and social content.
- At least one parent FK (`job_id`, `quote_id`, `invoice_id`) must be populated; enforced by CHECK constraint.
- When a file is soft-deleted (`deleted_at` set), the R2 objects are deleted by a post-commit side effect via the outbox worker. Schema row is retained for audit.

---

# 11. Domain 10 — Growth, Automation & System

## `growth_feed_items`

Contractor-visible agency deliverables — curated work signal. Monthly summaries are generated by cron on the first day of each month.

```sql
CREATE TABLE growth_feed_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations (id),
  type                growth_feed_type NOT NULL,
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,
  media_url           TEXT,
  is_monthly_summary  BOOLEAN NOT NULL DEFAULT FALSE,
  published_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_growth_feed_org_id ON growth_feed_items (org_id);
CREATE INDEX idx_growth_feed_published_at ON growth_feed_items (org_id, published_at DESC);
```

---

## `internal_activity_log`

Agency-internal micro-task log. Never visible to contractors. No RLS access for contractor roles. Accessed exclusively via service role through `/jafar` or agency tooling. Append-only. No soft delete. No updated_at.

```sql
CREATE TABLE internal_activity_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations (id),
  author_id       TEXT NOT NULL,       -- Agency staff identifier. Not an org_member UUID.
  activity_type   TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_internal_activity_log_org_id ON internal_activity_log (org_id);
CREATE INDEX idx_internal_activity_log_created_at ON internal_activity_log (org_id, created_at DESC);
```

---

## `notifications`

In-app notification records per org member. Drives the notification bell via Supabase Realtime. Purged after 90 days by nightly cron job. No soft delete.

```sql
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations (id),
  member_id       UUID NOT NULL REFERENCES org_members (id),
  type            TEXT NOT NULL,          -- e.g. 'new_job', 'quote_accepted', 'payment_received'
  title           TEXT NOT NULL,
  body            TEXT,
  resource_type   TEXT,                   -- Polymorphic. e.g. 'job', 'quote', 'invoice'
  resource_id     UUID,                   -- Polymorphic. Points to the related entity.
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_notifications_member_id ON notifications (member_id, created_at DESC);
CREATE INDEX idx_notifications_org_id ON notifications (org_id);
CREATE INDEX idx_notifications_unread ON notifications (member_id, read_at)
  WHERE read_at IS NULL;
-- Cron purge sweep index
CREATE INDEX idx_notifications_created_at ON notifications (created_at);
```

**Notes:**

- `resource_type` + `resource_id` are polymorphic. If the referenced entity is soft-deleted, the UI must handle this gracefully — show a "this item has been removed" state, never a crash.
- Retention: purged at 90 days by nightly cron. Unread notifications are not exempt — purged regardless of read status at 90 days.

---

## `automation_jobs`

BullMQ job tracking — audit trail for every automation execution. Distinct from `outbox_events`. Outbox = dispatch guarantee. Automation jobs = execution audit.

```sql
CREATE TABLE automation_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations (id),
  type            automation_job_type NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     UUID NOT NULL,
  bull_job_id     TEXT NOT NULL,
  status          automation_job_status NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  scheduled_for   TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_automation_jobs_org_id ON automation_jobs (org_id);
CREATE INDEX idx_automation_jobs_resource ON automation_jobs (resource_type, resource_id);
CREATE INDEX idx_automation_jobs_status ON automation_jobs (status);
CREATE INDEX idx_automation_jobs_type ON automation_jobs (type, status);
```

**Notes:**

- One row per BullMQ job — created before the job is enqueued.
- `type` identifies which automation sequence this job belongs to.
- `status` is updated by the BullMQ worker as the job progresses.
- `bull_job_id` links the database record to the BullMQ queue for management.
- Max retry attempts: 3 by default for all automation types.
- Never deleted — permanent automation audit trail.

---

## `outbox_events`

Transactional event dispatch table. Guarantees at-least-once delivery of all business events. Every business operation with side effects inserts here inside the database transaction.

```sql
CREATE TABLE outbox_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID REFERENCES organizations (id),  -- Nullable for platform-level events.
  event_type          TEXT NOT NULL,
  event_version       INTEGER NOT NULL DEFAULT 1,
  resource_type       TEXT NOT NULL,
  resource_id         UUID NOT NULL,
  payload             JSONB NOT NULL,
  status              outbox_event_status NOT NULL DEFAULT 'pending',
  attempts            INTEGER NOT NULL DEFAULT 0,
  max_attempts        INTEGER NOT NULL DEFAULT 3,
  sequence            SERIAL,                              -- Auto-increment. Guarantees ordering within a transaction.
  available_at        TIMESTAMPTZ NOT NULL DEFAULT now(),  -- Supports delayed processing.
  processed_at        TIMESTAMPTZ,
  dead_lettered_at    TIMESTAMPTZ,
  last_error          TEXT,
  idempotency_key     TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
-- Idempotency enforcement. Duplicate event inserts fail gracefully.
CREATE UNIQUE INDEX idx_outbox_events_idempotency_key
  ON outbox_events (idempotency_key);

-- Worker polling: claim pending events available for processing.
CREATE INDEX idx_outbox_events_worker_poll
  ON outbox_events (status, available_at)
  WHERE status = 'pending';

CREATE INDEX idx_outbox_events_org_id ON outbox_events (org_id);
-- Dead-letter visibility in /jafar
CREATE INDEX idx_outbox_events_dead_lettered
  ON outbox_events (org_id, dead_lettered_at)
  WHERE status = 'dead_lettered';
```

**Notes:**

- Worker claims rows via `SELECT ... FOR UPDATE SKIP LOCKED` to prevent double-processing under concurrent workers.
- `pg_notify('outbox_new_event', '')` fires on INSERT to wake the worker immediately. 30-second polling is the fallback if notify is missed.
- `available_at > now()` enables delayed processing (e.g., review funnel delay, quote follow-up delay).

---

## `org_counters`

Per-org sequential counters for quote and invoice numbers. `SELECT FOR UPDATE` on this row prevents race conditions in concurrent number generation.

```sql
CREATE TABLE org_counters (
  org_id                 UUID PRIMARY KEY REFERENCES organizations (id),
  next_quote_number     INTEGER NOT NULL DEFAULT 1,
  next_invoice_number   INTEGER NOT NULL DEFAULT 1,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE UNIQUE INDEX idx_org_counters_org_id
  ON org_counters (org_id);
```

**Number Generation Pattern:**

```sql
-- Always inside the same transaction that creates the quote or invoice.
SELECT next_quote_number FROM org_counters
  WHERE org_id = $1
  FOR UPDATE;                         -- Locks this row for the transaction duration.

UPDATE org_counters
  SET next_quote_number = next_quote_number + 1
  WHERE org_id = $1;

-- Use the returned number to set quotes.quote_number.
```

---

# 12. Table & Column Count Summary

| Domain                                  | Tables | Notes                                                                                                                                     |
| --------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Domain 1 — Org & Identity               | 3      | `organizations`, `org_members`, `automation_settings`                                                                                     |
| Domain 2 — Contacts                     | 3      | `contacts`, `contact_addresses`, `contact_notes`                                                                                          |
| Domain 3 — Pipeline                     | 2      | `pipeline_stages`, `opportunities`                                                                                                        |
| Domain 4 — Jobs                         | 1      | `jobs`                                                                                                                                    |
| Domain 5 — Communication                | 2      | `conversations`, `messages`                                                                                                               |
| Domain 6 — Revenue                      | 8      | `quotes`, `quote_line_items`, `quote_views`, `quote_templates`, `quote_template_line_items`, `invoices`, `invoice_line_items`, `payments` |
| Domain 7 — Appointments                 | 1      | `appointments`                                                                                                                            |
| Domain 8 — Reputation                   | 3      | `review_requests`, `reviews`, `private_feedback`                                                                                          |
| Domain 9 — Files & Media                | 1      | `media`                                                                                                                                   |
| Domain 10 — Growth, Automation & System | 6      | `growth_feed_items`, `internal_activity_log`, `notifications`, `automation_jobs`, `outbox_events`, `org_counters`                         |
| **Total**                               | **30** |                                                                                                                                           |

**`org_members` permission columns:** 39 boolean columns — all NOT NULL.

---

# 13. Tables Without Soft Delete (Intentional)

| Table                   | Reason                                              |
| ----------------------- | --------------------------------------------------- |
| `payments`              | Financial immutability. No refunds in v1.           |
| `quote_views`           | Append-only log. Immutable tracking record.         |
| `reviews`               | Immutable public review record.                     |
| `growth_feed_items`     | Permanent agency work log. Never deleted.           |
| `internal_activity_log` | Append-only audit log.                              |
| `notifications`         | Purged by cron at 90 days. Soft delete unnecessary. |

---

# 14. Gaps Resolved by This Document

| Gap                                     | Resolution                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `invoices.status` partial payment state | `partially_paid` added to `invoice_status` enum                                              |
| Quote public token                      | `quotes.public_token_hash TEXT NOT NULL UNIQUE` — SHA-256 only, no raw token stored          |
| Token validity                          | Derived from `status`, `expires_at`, `deleted_at` — no separate token expiry column          |
| Invoice status transitions              | Fully documented including partial payment paths                                             |
| Reminder reset on reschedule            | `reminder_24h_sent` and `reminder_1h_sent` reset to FALSE — documented in appointments notes |
| Sequential number generation            | `org_counters` + `SELECT FOR UPDATE` pattern documented                                      |
| Outbox worker polling                   | Composite index on `(status, available_at) WHERE status = 'pending'`                         |

---

# 15. What This Document Unlocks

| Next Phase                   | Unblocked By                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| RLS Policy Matrix            | All table shapes confirmed. `org_id` on every table. `assigned_to` columns defined. `auth.users` relationship clear.         |
| Drizzle Schema File          | All column types, constraints, enums, and indexes defined. Ready for direct translation.                                     |
| API Boundary Spec            | All FK relationships and nullable rules documented. Transaction boundaries for number generation and outbox insertion clear. |
| BullMQ Worker Implementation | `automation_jobs` shape confirmed. `outbox_events` polling index defined.                                                    |
| Seed Data Script             | `automation_settings` defaults documented. Permission seeding rules documented.                                              |
| Constraint & Index Review    | All partial unique indexes, CHECK constraints, and composite indexes defined.                                                |

---

_Core Schema Design v1 — Draft_ _30 tables. 10 domains. All enums defined. All constraints specified. All indexes documented._ _Two pre-schema gaps resolved: `partially_paid` status and `public_token_hash`._ _Ready for RLS Policy Matrix._
