# Domain 1 — Organization & Identity

Tables: `organizations`, `org_members`, `automation_settings`, `org_usage`
Enums used: `org_status`, `member_role`

---

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

  -- Feature gates (22 booleans)
  feature_one_way_sms               BOOLEAN NOT NULL DEFAULT TRUE,
  feature_two_way_sms               BOOLEAN NOT NULL DEFAULT FALSE,
  feature_bulk_sms                  BOOLEAN NOT NULL DEFAULT FALSE,
  feature_conversations             BOOLEAN NOT NULL DEFAULT TRUE,
  feature_missed_call_textback      BOOLEAN NOT NULL DEFAULT FALSE,
  feature_team_management           BOOLEAN NOT NULL DEFAULT TRUE,
  feature_appointments              BOOLEAN NOT NULL DEFAULT TRUE,
  feature_media_uploads             BOOLEAN NOT NULL DEFAULT TRUE,
  feature_automation_engine         BOOLEAN NOT NULL DEFAULT FALSE,
  feature_review_funnel             BOOLEAN NOT NULL DEFAULT FALSE,
  feature_appointment_reminders     BOOLEAN NOT NULL DEFAULT FALSE,
  feature_invoice_reminders         BOOLEAN NOT NULL DEFAULT FALSE,
  feature_financial_tools           BOOLEAN NOT NULL DEFAULT TRUE,
  feature_stripe_payments           BOOLEAN NOT NULL DEFAULT FALSE,
  feature_growth_feed               BOOLEAN NOT NULL DEFAULT FALSE,
  feature_advanced_reporting        BOOLEAN NOT NULL DEFAULT FALSE,
  feature_ai_assistant              BOOLEAN NOT NULL DEFAULT FALSE,
  feature_custom_branding           BOOLEAN NOT NULL DEFAULT FALSE,
  feature_api_access                BOOLEAN NOT NULL DEFAULT FALSE,
  feature_webhooks                  BOOLEAN NOT NULL DEFAULT FALSE,
  feature_client_portal             BOOLEAN NOT NULL DEFAULT FALSE,
  feature_email_conversations       BOOLEAN NOT NULL DEFAULT FALSE,

  -- Usage / quota limits
  max_team_members                  INTEGER NOT NULL DEFAULT 3,
  max_monthly_sms                   INTEGER NOT NULL DEFAULT 500,
  max_bulk_sms_per_day              INTEGER NOT NULL DEFAULT 50,
  max_ai_requests_per_month         INTEGER NOT NULL DEFAULT 0,
  max_storage_gb                    INTEGER NOT NULL DEFAULT 5,
  max_automation_workflows          INTEGER NOT NULL DEFAULT 0,

  -- Integration state
  integration_status                JSONB NOT NULL DEFAULT '{}',

  -- Audit
  feature_overrides_updated_at      TIMESTAMPTZ,
  feature_flags_updated_by          UUID REFERENCES org_members (id),

  -- Stripe
  stripe_restricted_key   TEXT,           -- encrypted at rest via Supabase Vault
  stripe_publishable_key  TEXT,
  stripe_webhook_secret   TEXT,           -- encrypted at rest via Supabase Vault
  stripe_account_id       TEXT,           -- acct_xxx, display only
  stripe_connected_at     TIMESTAMPTZ,

  -- Org profile
  is_setup_complete     BOOLEAN NOT NULL DEFAULT FALSE,
  logo_url              TEXT,
  primary_color         TEXT,
  timezone              TEXT NOT NULL DEFAULT 'America/Chicago',
  address               TEXT,
  city                  TEXT,
  state                 TEXT,
  zip                   TEXT,

  -- Lifecycle
  suspended_at          TIMESTAMPTZ,
  deletion_scheduled_at TIMESTAMPTZ,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_organizations_status ON organizations (status);
CREATE UNIQUE INDEX idx_organizations_twilio_phone
  ON organizations (twilio_phone_number);
```

**Notes:**

- `twilio_phone_number` unique at infrastructure level (Twilio account) AND DB constraint. One number per org.
- Org deletion: application-level cron in explicit FK-safe order across schema tables. `org_usage` has `ON DELETE CASCADE`; the deletion cron may still delete it explicitly for audit clarity.
- `is_setup_complete` gates the contractor app UI — set to TRUE by Platform Owner when onboarding finishes.
- Feature flags injected into JWT `app_metadata` by `custom_access_token_hook` alongside `org_id` and `role`.
- Feature flags managed via `/jafar`; agency sets defaults during onboarding.

---

## `org_members`

All users within a contractor org. Contains role, profile, active status, and all 40
fine-grained permission booleans.

```sql
CREATE TABLE org_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations (id),
  supabase_user_id      UUID NOT NULL,           -- FK to auth.users (Supabase managed)
  email                 TEXT NOT NULL,           -- Denormalized from auth. READ-ONLY on this table.
  full_name             TEXT NOT NULL,
  avatar_url            TEXT,
  role                  member_role NOT NULL,    -- Coarse role. UI template display ONLY.
                                                 -- NEVER used for access control at runtime.
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ================================================================
  -- 40 PERMISSION COLUMNS — All NOT NULL. TRUE or FALSE only.
  -- Admin rows: all seeded TRUE at creation.
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

  -- Module 8: Jobs
  can_view_assigned_jobs          BOOLEAN NOT NULL DEFAULT FALSE,

  -- Module 9: Appointments (continued)
  can_create_appointments         BOOLEAN NOT NULL DEFAULT FALSE,
  can_reschedule_appointments     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Module 10: Reputation
  can_view_reviews                BOOLEAN NOT NULL DEFAULT FALSE,
  can_send_review_requests        BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_negative_feedback      BOOLEAN NOT NULL DEFAULT FALSE,

  -- Module 11: Growth Feed
  can_view_growth_feed            BOOLEAN NOT NULL DEFAULT FALSE,

  -- Module 12: Files & Media
  can_view_all_files              BOOLEAN NOT NULL DEFAULT FALSE,
  can_upload_files                BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete_files                BOOLEAN NOT NULL DEFAULT FALSE,

  -- Module 13: Team Management
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

- DEFAULT FALSE on permissions is a safety net only. Application code seeds explicit TRUE/FALSE at creation.
- `email` must never be updated directly. Email changes flow through Supabase Auth → trigger → org_members update.
- `supabase_user_id` is globally unique — one auth identity can only belong to one org.
- `deleted_at` is used for deactivation. Rows are never hard-deleted.
- The Platform Owner has NO row in this table.

---

## `org_usage`

Atomic usage counters per organization, per metric, per period. Used for quota
enforcement and future billing reports.

```sql
CREATE TABLE org_usage (
  org_id               UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  period_start_date    DATE NOT NULL DEFAULT '1900-01-01',
  metric               TEXT NOT NULL CHECK (metric IN (
                         'sms_sent',
                         'bulk_sms_sent',
                         'ai_requests',
                         'storage_bytes',
                         'automation_workflows'
                       )),
  value                BIGINT NOT NULL DEFAULT 0 CHECK (value >= 0),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_incremented_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, period_start_date, metric)
);
```

**Indexes:**

```sql
CREATE INDEX idx_org_usage_org_metric_period
  ON org_usage (org_id, metric, period_start_date DESC);

CREATE INDEX idx_org_usage_period_start
  ON org_usage (period_start_date);
```

**RLS:**

```sql
ALTER TABLE org_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_usage_select_own_org ON org_usage
  FOR SELECT
  USING (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid);
```

**Notes:**

- `organizations.max_*` columns store quota limits; `org_usage.value` stores usage.
- `period_start_date` is the first day of the monthly usage period.
- Sentinel `1900-01-01` represents lifetime metrics with no monthly reset window.
- `storage_bytes` is a lifetime/current-total metric unless product rules define a reset window later.
- Usage increments must be atomic and scoped by `(org_id, period_start_date, metric)`.
- Contractor JWTs can SELECT own-org usage rows only. All increments and corrections use service-role API routes or workers.

---

## `automation_settings`

One row per org. Controls all automation on/off switches and message templates.

```sql
CREATE TABLE automation_settings (
  id                                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                              UUID NOT NULL REFERENCES organizations (id),

  -- Missed Call Text-Back
  missed_call_textback_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  missed_call_textback_message        TEXT NOT NULL DEFAULT 'Hi! We missed your call. We''ll be in touch shortly — or reply here and we''ll get back to you right away.',

  -- Quote Follow-Up (two reminders, same message template)
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
  google_review_link                  TEXT,
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
- `google_review_link` set by agency/Platform Owner once GBP link is known. Used by review funnel for positive-review SMS.
- Message templates support `{contact_name}` and `{org_name}` interpolation tokens at send time.
- Same `quote_followup_message` used for both follow-up reminders.
- No `deleted_at` — never independently deleted. Deleted only when parent org is deleted.

---

## `org_email_settings`

Per‑org email domain configuration. One row per org.

```sql
CREATE TABLE org_email_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,

  -- Contractor's dedicated reply subdomain. e.g. 'reply.rahim.com'
  reply_domain            TEXT,

  -- Domain verification state
  domain_status           email_domain_status NOT NULL DEFAULT 'pending',
  domain_verified_at      TIMESTAMPTZ,
  domain_last_checked_at  TIMESTAMPTZ,

  -- Email provider identifier: 'resend' | 'postmark'
  provider                TEXT NOT NULL DEFAULT 'resend',

  -- Provider domain/server ID (Resend domain ID, Postmark server ID)
  provider_domain_id      TEXT,

  -- DNS records generated by the email provider (JSONB)
  dns_records_required    JSONB NOT NULL DEFAULT '{}',

  -- Outbound sending identity
  from_name               TEXT,
  from_address            TEXT,

  -- Inbound email routing enabled flag
  inbound_enabled         BOOLEAN NOT NULL DEFAULT FALSE,

  -- Webhook signing secret (encrypted at rest)
  inbound_webhook_secret  TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE UNIQUE INDEX idx_org_email_settings_org_id
  ON org_email_settings (org_id);

CREATE UNIQUE INDEX idx_org_email_settings_reply_domain
  ON org_email_settings (reply_domain)
  WHERE reply_domain IS NOT NULL;
```

**Notes:**

- `reply_domain` is stored lowercase and trimmed. Unique platform-wide.
- Provider validation: only `resend` and `postmark` allowed.
- SENSITIVE FIELDS stripped by API layer before returning to contractor: `inbound_webhook_secret`, `provider_domain_id`, `dns_records_required`.
- Table is NOT Realtime‑subscribed. Domain verification status is polled via API route.

