# Master Domain Architecture v1

# Contractor Growth Operating System

> Last Updated: May 2026 | Status: Approved | Depends On: Blueprint v3, Roles & Access Matrix v2

---

# Confirmed Architectural Decisions

All decisions below are locked before this document was written.

| Decision                              | Confirmed Value                                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Pipeline stages                       | Configurable per org — `pipeline_stages` table                                                                               |
| Quote `opportunity_id`                | Optional — quotes can exist without an opportunity                                                                           |
| Invoice `job_id`                      | Optional — invoices can exist without a job                                                                                  |
| Contact tags                          | `text[]` array column on `contacts` — no separate tags table                                                                 |
| Lead model                            | Leads are contacts immediately — `contacts.status` tracks lifecycle                                                          |
| Job model                             | Separate entity — created when an opportunity is moved to a Won stage                                                        |
| Assignee model                        | Single assignee — `assigned_to UUID` FK on contacts, opportunities, conversations, jobs, appointments                        |
| Permissions model                     | Fine-grained boolean columns directly on `org_members`                                                                       |
| Admin permission columns              | Seeded as `TRUE` — never `NULL`. No three-state booleans in authorization                                                    |
| Manager/Member permission columns     | Seeded as explicit `TRUE` or `FALSE` from role template — never `NULL`                                                       |
| Super admin                           | Outside Supabase Auth — env vars + server-side session — no DB row                                                           |
| Soft deletes                          | `deleted_at` on all major entities                                                                                           |
| Tenant isolation                      | `org_id` on every entity                                                                                                     |
| Contact addresses                     | Separate `contact_addresses` table — contacts hold identity only, not addresses                                              |
| Job address                           | Snapshot fields on `jobs` — copied from contact address at creation, historically immutable                                  |
| Assignment on member deactivation     | Preserve `assigned_to` — deactivated members stay referenced for audit, attribution, reporting                               |
| Phone normalization                   | E.164 format enforced at write time before deduplication check                                                               |
| SMS opt-out                           | `sms_opt_out` boolean on `contacts` — required for TCPA compliance                                                           |
| Quote templates                       | `quote_templates` + `quote_template_line_items` tables — in scope                                                            |
| Appointment type                      | `type` enum on `appointments` — estimate, job_start, follow_up, inspection, other                                            |
| Stripe idempotency                    | `UNIQUE` constraint on `payments.stripe_payment_intent_id`                                                                   |
| Pipeline stage uniqueness             | Partial unique indexes enforce single `is_won`, `is_lost`, `is_default` per org                                              |
| Review request uniqueness             | `UNIQUE(job_id)` constraint on `review_requests` — one per job                                                               |
| sent_by on review_requests            | Two typed columns: `sent_by_automation boolean` + `sent_by_member_id UUID nullable`                                          |
| USD only (v1)                         | No `currency` field — all financial values are USD                                                                           |
| One pipeline per org (v1)             | No `pipeline_id` on `pipeline_stages` — single pipeline per org                                                              |
| Quote acceptance behavior             | Decoupled from Won — acceptance fires notification only. Staff manually moves opportunity to Won                             |
| `jobs.opportunity_id`                 | NOT NULL and UNIQUE — always created from an opportunity, one job per opportunity                                            |
| `contacts` phone uniqueness           | `UNIQUE(org_id, phone)`                                                                                                      |
| `contact_addresses.is_primary`        | Partial unique index `UNIQUE(contact_id) WHERE is_primary = true` — not application-level only                               |
| `pipeline_stages` soft delete         | `deleted_at` column added — stages are soft-deleted, never hard-deleted                                                      |
| `quote_template_line_items` cascade   | Soft-deleted at application level when parent template is soft-deleted — PostgreSQL cascade does not fire on `deleted_at`    |
| `appointments.location` default       | Defaults from `job.service_address` when `job_id` present — independently editable                                           |
| Payment model                         | Contractor-owned Stripe: each contractor connects their own Stripe account. The platform operates with a restricted API key. |
| Appointment booking links             | Deferred to post-v1 — calendar integration and public booking pages are not in scope                                         |
| `invoices.amount_due` source of truth | `payments` are the authoritative source — invoice balance fields are denormalized convenience values only                    |
| Soft-delete + UNIQUE numbers          | Quote and invoice numbers are never reused — enforced by full unique constraint (no WHERE clause)                            |
| `contacts.phone` reuse after delete   | Phone numbers remain blocked after soft delete — no reuse. Intentional                                                       |
| `notifications` retention             | Notifications older than 90 days are purged by the nightly cron job, regardless of read status                               |
| `growth_feed_items` monthly summary   | Generated by scheduled cron on first day of each month                                                                       |
| `org_members.email` sync rule         | Read-only on `org_members` — email changes must go through Supabase Auth and trigger `org_members` update                    |
| Org deletion cascade order            | Application-level cron — explicit deletion order across 30 tables to respect FK constraints                                  |
| `messages.status` extensibility       | `queued` and `bounced` reserved for future email channel support — no v1 action                                              |
| `job_status_history`                  | Deferred to post-v1 — activity timeline partially covers operational progression                                             |

---

# 1. Entity Index

30 entities across 10 domains. Every table that will exist in this system.

## Domain 1 — Organization & Identity

| Entity                | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `organizations`       | The root tenant record — one per contractor business |
| `org_members`         | Users within an org — role, permissions, profile     |
| `automation_settings` | Per-org automation on/off configuration and settings |

## Domain 2 — Contacts

| Entity              | Purpose                                                               |
| ------------------- | --------------------------------------------------------------------- |
| `contacts`          | Unified lead and customer record — full lifetime relationship history |
| `contact_addresses` | Reusable addresses per contact — billing, service, mailing            |
| `contact_notes`     | Freeform notes authored by team members on a contact                  |

## Domain 3 — Pipeline

| Entity            | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| `pipeline_stages` | Configurable pipeline stages per org — position, type, color |
| `opportunities`   | A deal or potential job moving through the pipeline          |

## Domain 4 — Jobs

| Entity | Purpose                                                          |
| ------ | ---------------------------------------------------------------- |
| `jobs` | Operational delivery entity — created when an opportunity is Won |

## Domain 5 — Communication

| Entity          | Purpose                                                          |
| --------------- | ---------------------------------------------------------------- |
| `conversations` | A unified communication thread with a contact across any channel |
| `messages`      | Individual messages within a conversation — inbound or outbound  |

## Domain 6 — Revenue

| Entity                      | Purpose                                              |
| --------------------------- | ---------------------------------------------------- |
| `quotes`                    | A priced proposal sent to a contact                  |
| `quote_line_items`          | Individual line items on a quote                     |
| `quote_views`               | View tracking records for quote-viewed notifications |
| `quote_templates`           | Reusable quote templates — pre-built line item sets  |
| `quote_template_line_items` | Individual line items on a quote template            |
| `invoices`                  | A payment request issued to a contact                |
| `invoice_line_items`        | Individual line items on an invoice                  |
| `payments`                  | A payment record against an invoice                  |

## Domain 7 — Appointments

| Entity         | Purpose                                                |
| -------------- | ------------------------------------------------------ |
| `appointments` | A scheduled visit, estimate, or meeting with a contact |

## Domain 8 — Reputation

| Entity             | Purpose                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| `review_requests`  | A review request sent to a contact after job completion                |
| `reviews`          | A received review record — positive outcome of review funnel           |
| `private_feedback` | Private negative feedback — captured before it becomes a public review |

## Domain 9 — Files & Media

| Entity  | Purpose                                                                   |
| ------- | ------------------------------------------------------------------------- |
| `media` | All org media — job photos, attachments, marketing assets — metadata only |

## Domain 10 — Growth, Automation & System

| Entity                  | Purpose                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `growth_feed_items`     | Contractor-visible agency deliverables — curated signal                                             |
| `internal_activity_log` | Agency-internal micro-task log — never visible to contractors                                       |
| `notifications`         | In-app notification records per org member                                                          |
| `automation_jobs`       | BullMQ job tracking — audit trail for every automation execution                                    |
| `outbox_events`         | Transactional event dispatch — guarantees business state and async processing are always consistent |
| `org_counters`          | Per-org sequential counters for quote and invoice numbers — lock-safe generation                    |

---

# 2. Domain Map

```
┌─────────────────────────────────────────────────────────────────────┐
│  PLATFORM LAYER (no DB rows — env vars + server session only)       │
│  Super Admin (/jafar)                                               │
└─────────────────────────────────────────────────────────────────────┘
                              │ creates
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  DOMAIN 1 — ORGANIZATION & IDENTITY                                 │
│  organizations ── org_members ── automation_settings               │
└─────────────────────────────────────────────────────────────────────┘
          │ org_id scopes every entity below this line
          │
          ├────────────────────────────────────────────┐
          ▼                                            ▼
┌────────────────────────┐             ┌──────────────────────────┐
│  DOMAIN 2 — CONTACTS   │             │  DOMAIN 3 — PIPELINE     │
│  contacts              │◄────────────│  pipeline_stages         │
│  contact_notes         │             │  opportunities           │
└────────────────────────┘             └──────────────────────────┘
          │                                            │ Won stage
          │                                            ▼
          │                             ┌──────────────────────────┐
          │                             │  DOMAIN 4 — JOBS         │
          │                             │  jobs                    │
          │                             └──────────────────────────┘
          │                                            │
          ├──────────────────┬────────────────────────┤
          ▼                  ▼                         ▼
┌────────────────┐  ┌──────────────────────┐  ┌──────────────────┐
│ DOMAIN 5       │  │  DOMAIN 6 — REVENUE  │  │  DOMAIN 7        │
│ COMMUNICATION  │  │  quotes              │  │  APPOINTMENTS    │
│ conversations  │  │  quote_line_items    │  │  appointments    │
│ messages       │  │  quote_views         │  └──────────────────┘
└────────────────┘  │  invoices            │
                    │  invoice_line_items  │
                    │  payments            │
                    └──────────────────────┘
          │
          ├────────────────────────────────────────────┐
          ▼                                            ▼
┌──────────────────────────┐             ┌────────────────────────┐
│  DOMAIN 8 — REPUTATION   │             │  DOMAIN 9 — MEDIA      │
│  review_requests         │             │  media                 │
│  reviews                 │             └────────────────────────┘
│  private_feedback        │
└──────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  DOMAIN 10 — GROWTH, AUTOMATION & SYSTEM                           │
│  growth_feed_items    internal_activity_log                        │
│  notifications        automation_jobs                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

# 3. Entity Definitions

---

## DOMAIN 1 — Organization & Identity

---

### `organizations`

**Purpose:** The root tenant record. Every piece of data in the system belongs to an organization.

**Key Fields:**

```
id                    UUID, primary key
name                  Business name
slug                  URL-safe unique identifier
trade_type            roofing | hvac | plumbing | electrical | remodeling |
                      landscaping | flooring | general | painting | home_services
status                active | suspended | pending_deletion | deleted
plan                  starter | growth | pro
twilio_phone_number   Dedicated Twilio number for this org
stripe_restricted_key   Contractor's Stripe restricted API key (encrypted at rest, nullable)
stripe_publishable_key  Contractor's Stripe publishable key (nullable)
stripe_webhook_secret   Contractor's Stripe webhook signing secret (encrypted at rest, nullable)
stripe_account_id       Contractor's Stripe account ID for display (nullable)
stripe_connected_at     When contractor connected their Stripe account (nullable)
logo_url              Cloudflare R2 path to org logo (nullable)
primary_color         Hex string for branding (nullable)
timezone              IANA timezone string (e.g. America/New_York)
address
city
state
zip
suspended_at          Timestamp when suspended (nullable)
deletion_scheduled_at Timestamp when deletion is scheduled (nullable)
created_at
updated_at
deleted_at
```

**Lifecycle:**

```
active → suspended → pending_deletion → deleted
```

**Rules:**

- Every org is created by the Platform Owner via `/jafar`
- `slug` is unique across the platform
- `twilio_phone_number` is assigned at org creation
- When `deleted`: all org data is permanently and irreversibly removed by cron job
- Before initiating the deletion cascade, all pending outbox events for the org must be set to `status = 'cancelled'` so the outbox worker does not attempt to process them while data is being removed.
- Org deletion cascade order must respect FK constraints — deletion proceeds in this sequence: automation_jobs → outbox_events → notifications → automation_settings → internal_activity_log → growth_feed_items → media → private_feedback → reviews → review_requests → payments → invoice_line_items → invoices → quote_views → quote_line_items → quotes → quote_template_line_items → quote_templates → messages → conversations → appointments → jobs → opportunities → pipeline_stages → contact_notes → contact_addresses → contacts → org_members → org_counters → organizations
- org_members rows are NEVER hard-deleted in normal operation — soft delete only. During the final org deletion cron sequence, org_members are hard-deleted as part of the explicit cascade order.

---

### `org_members`

**Purpose:** A user account within a contractor org. Holds identity, role, and the complete fine-grained permission set.

**Key Fields:**

```
id          UUID, primary key
org_id      FK → organizations
supabase_user_id     FK → Supabase Auth users (auth.users.id)
full_name
email
role        admin | manager | member
avatar_url  Cloudflare R2 path (nullable)
is_active   boolean — soft disable without deletion

-- PERMISSION COLUMNS
-- Initialized from role template. Overridable per member.
-- Boolean columns are the ONLY source of truth for access control.
-- The role column is never used for runtime permission checks.
-- Total: 39 columns across 11 modules.

-- Dashboard
can_view_dashboard              boolean
can_view_revenue                boolean
can_view_pipeline_snapshot      boolean

-- Inbox
can_view_all_conversations      boolean
can_view_assigned_conversations boolean
can_send_messages               boolean
can_delete_conversations        boolean

-- Contacts
can_view_all_contacts           boolean
can_create_contacts             boolean
can_edit_contacts               boolean
can_delete_contacts             boolean

-- Pipeline
can_view_full_pipeline          boolean
can_move_pipeline_stages        boolean
can_create_opportunities        boolean

-- Quotes
can_view_all_quotes             boolean
can_create_quotes               boolean
can_send_quotes                 boolean
can_edit_quotes                 boolean
can_delete_quotes               boolean

-- Invoices
can_view_all_invoices           boolean
can_create_invoices             boolean
can_send_invoices               boolean
can_record_payments             boolean
can_delete_invoices             boolean

-- Appointments
can_view_all_appointments       boolean
can_view_assigned_appointments  boolean
can_create_appointments         boolean
can_reschedule_appointments     boolean

-- Reputation
can_view_reviews                boolean
can_send_review_requests        boolean
can_view_negative_feedback      boolean

-- Growth Feed
can_view_growth_feed            boolean

-- Files & Media
can_view_all_files              boolean
can_upload_files                boolean
can_delete_files                boolean

-- Team Management
can_view_team_members           boolean
can_create_team_members         boolean
can_edit_team_members           boolean
can_delete_team_members         boolean

created_at
updated_at
deleted_at
```

**Rules:**

- Admin role: all 39 permission columns are seeded as `TRUE` at account creation — never `NULL`
- Manager and Member: all 39 permission columns seeded from role template as explicit `TRUE` or `FALSE` — never `NULL`
- No three-state boolean logic exists anywhere in the permission system — every column is always deterministic
- `user_id` references Supabase Auth — auth record and org_member record are created together
- `email` is denormalized from Supabase Auth for query convenience — it is read-only on `org_members`. Any email change must go through Supabase Auth first and trigger a corresponding `org_members.email` update. Direct mutation of `org_members.email` is forbidden
- `org_members` rows are NEVER hard-deleted — soft delete only. Hard deletion would break FK references across audit trails, notes, assignments, and timeline history
- One `org_member` row per user per org — a user cannot belong to two orgs in v1
- `is_active = false` prevents login without deleting the record
- Admin accounts are created by Platform Owner via `/jafar`
- Manager and Member accounts are created by Admin via Team Management

---

### `automation_settings`

**Purpose:** Per-org configuration for all BullMQ automation sequences. One row per org.

**Key Fields:**

```
id                              UUID, primary key
org_id                          FK → organizations, UNIQUE
missed_call_textback_enabled    boolean, default true
missed_call_textback_message    text
speed_to_lead_enabled           boolean, default true
speed_to_lead_message           text
quote_followup_enabled          boolean, default true
quote_followup_delay_1_hours    integer, default 24
quote_followup_delay_2_hours    integer, default 72
invoice_reminder_enabled        boolean, default true
invoice_reminder_days_overdue   integer, default 1
review_funnel_enabled           boolean, default true
review_funnel_delay_hours       integer, default 2
appointment_reminder_enabled    boolean, default true
created_at
updated_at
```

**Rules:**

- Created automatically when a new org is created — seeded with defaults
- Accessible to Admin only in the Contractor App
- Agency team configures this during onboarding

---

## DOMAIN 2 — Contacts

---

### `contacts`

**Purpose:** The unified relationship record for every person the org has interacted with. One record from first lead touch to repeat customer. Holds identity only — addresses live in `contact_addresses`.

**Key Fields:**

```
id            UUID, primary key
org_id        FK → organizations
full_name
email         nullable
phone         NOT NULL — primary deduplication key, stored in E.164 format (+15551234567)
status        lead | customer | archived
tags          text[]
assigned_to   FK → org_members (nullable — operational assignment)
lead_source   website_form | live_chat | missed_call | manual | referral | other
sms_opt_out   boolean, default false — TCPA compliance flag
sms_opt_out_at timestamp (nullable — timestamp of opt-out)
notes         text (nullable — short field; long notes go in contact_notes)
created_at
updated_at
deleted_at
```

**Lifecycle:**

```
lead → customer → archived
```

**Rules:**

- Phone number is the deduplication key — `UNIQUE(org_id, phone)`
- Phone must be normalized to E.164 format at write time before dedup check fires
- When a new activity arrives with an existing phone: linked to existing contact, assigned member alerted, no silent merge
- When opportunity is Won: `status` automatically updates to `customer`
- `tags` is `text[]` — no separate tags infrastructure
- `sms_opt_out = true` must block ALL outbound automated SMS for this contact — BullMQ automation workers must check this flag before enqueuing any SMS job
- Contacts belong to the org, not to individual members
- No address fields on contacts — all addresses live in `contact_addresses`
- Soft delete only. Phone numbers of soft-deleted contacts remain blocked — no reuse. Intentional: prevents silent re-creation of a deleted person's record

---

### `contact_notes`

**Purpose:** Long-form freeform notes on a contact. Appears in the activity timeline.

**Key Fields:**

```
id          UUID, primary key
org_id      FK → organizations
contact_id  FK → contacts
author_id   FK → org_members
body        text
created_at
updated_at
deleted_at
```

---

### `contact_addresses`

**Purpose:** Reusable addresses for a contact. A contact may have multiple addresses — billing, service location, mailing, commercial site. Addresses are independent from job service locations.

**Key Fields:**

```
id            UUID, primary key
org_id        FK → organizations
contact_id    FK → contacts
label         address_label
address       text
city          text
state         text
zip           text
is_primary    boolean, default false
created_at
updated_at
deleted_at
```

**Rules:**

- Each contact can have multiple addresses
- Maximum one primary address per contact enforced by partial unique index: `UNIQUE(contact_id) WHERE is_primary = true` — prevents race conditions creating two primary addresses
- "At least one primary" is enforced at application level only — not at DB level
- When a job is created: the contact's primary service address is copied as a snapshot into the job's service address fields — after that point the job address is independent
- If a contact's address changes after a job is completed, the job address is unaffected — historical accuracy is preserved
- Soft delete only
- Soft-deleted contacts permanently reserve their phone number by default. An Admin may manually release the reserved phone number through a dedicated override action when the number has been legitimately reassigned to a new person. This action is intentionally restricted and must require explicit confirmation.

---

## DOMAIN 3 — Pipeline

---

### `pipeline_stages`

**Purpose:** Configurable pipeline stages per org.

**Key Fields:**

```
id            UUID, primary key
org_id        FK → organizations
name          text
color         hex string
position      integer — display order, 1-indexed, unique per org
is_won        boolean, default false
is_lost       boolean, default false
is_default    boolean — new opportunities land here
created_at
updated_at
deleted_at
```

**Rules:**

- Exactly one stage per org must have `is_won = true`
- Exactly one stage per org must have `is_lost = true`
- Exactly one stage per org must have `is_default = true`
- All three enforced by partial unique indexes — not application logic alone
- Default stage set is seeded on org creation from the blueprint defaults
- A stage cannot be soft-deleted while live opportunities exist in it — enforced at application level before deletion
- Soft delete only — stages are never hard-deleted

**Default Seed:**

```
1.  New Lead            (is_default = true)
2.  Contacted
3.  Estimate Scheduled
4.  Quoted
5.  Follow-Up
6.  Won                 (is_won = true)
7.  Lost                (is_lost = true)
```

---

### `opportunities`

**Purpose:** A deal moving through the pipeline — a potential job being tracked from lead to close.

**Key Fields:**

```
id              UUID, primary key
org_id          FK → organizations
contact_id      FK → contacts
stage_id        FK → pipeline_stages
assigned_to     FK → org_members (nullable)
title           text (e.g. "Roof replacement — 123 Main St")
value           decimal (nullable — estimated job value)
lost_reason     text (nullable — populated on Lost stage)
closed_at       timestamp (nullable — set on Won or Lost)
created_at
updated_at
deleted_at
```

**Lifecycle:**

```
Created in default stage
→ Moves through pipeline stages (drag and drop)
→ Reaches Won stage  → job created automatically → closed_at set
→ Reaches Lost stage → lost_reason recorded      → closed_at set
```

**Rules:**

- When moved to a stage where `is_won = true`: `jobs` row is created immediately
- `value` is an estimate — actual revenue lives on invoices
- Soft delete only

---

## DOMAIN 4 — Jobs

---

### `jobs`

**Purpose:** The operational delivery record. Tracks the actual work being done for a customer. Holds its own snapshot service address — independent from the contact's current address.

**Key Fields:**

```
id                UUID, primary key
org_id            FK → organizations
opportunity_id    FK → opportunities — NOT NULL, UNIQUE (one job per opportunity, always from Won stage)
contact_id        FK → contacts (denormalized from opportunity at creation)
assigned_to       FK → org_members (nullable)
title             text (inherited from opportunity, editable)
status            scheduled | in_progress | completed | cancelled
service_address   text (nullable — snapshot of job site at creation time)
service_city      text (nullable)
service_state     text (nullable)
service_zip       text (nullable)
scheduled_start   timestamptz (nullable)
scheduled_end     timestamptz (nullable)
completed_at      timestamp (nullable)
scope_of_work     text (nullable — detailed description for field crew)
notes             text (nullable — operational notes)
created_at
updated_at
deleted_at
```

**Lifecycle:**

```
scheduled → in_progress → completed
                        → cancelled
```

**Rules:**

- Always created from a Won opportunity — never created manually in v1
- `opportunity_id` is NOT NULL and UNIQUE — one opportunity produces exactly one job, enforced at database level. Prevents duplicate jobs from concurrent Won-stage transitions, webhook retries, and automation replays
- `contact_id` is denormalized at creation time and never updated
- Service address fields are a snapshot — copied from contact's primary service address at creation time. If the contact's address changes later, completed job records are unaffected
- When `status → completed`: `job.completed` event emitted → review funnel triggered
- Soft delete only

---

## DOMAIN 5 — Communication

---

### `conversations`

**Purpose:** A unified communication thread with a contact on a specific channel.

**Key Fields:**

```
id                UUID, primary key
org_id            FK → organizations
contact_id        FK → contacts
channel           sms | email | webchat | missed_call
assigned_to       FK → org_members (nullable)
status            open | closed | archived
subject           text (nullable — for email threads)
last_message_at   timestamp — inbox sort key
unread_count      integer, default 0
tags              text[]
created_at
updated_at
deleted_at
```

**Rules:**

- One active conversation per contact per channel — new messages append to existing open conversation
- `last_message_at` updated on every new message
- `unread_count` increments on inbound messages, resets to 0 when a team member opens the conversation
- `unread_count` is a stored denormalized value for query performance — it can theoretically drift. If drift is detected, it can be reconciled by counting `messages WHERE conversation_id = x AND direction = 'inbound' AND read_at IS NULL`
- Members can only access conversations where `assigned_to = their user_id`
- When a contact opts out of SMS, their open SMS conversation remains visible but the UI must show an opt-out banner and disable the send button. The conversation is not automatically closed.

---

### `messages`

**Purpose:** A single message within a conversation.

**Key Fields:**

```
id                  UUID, primary key
org_id              FK → organizations
conversation_id     FK → conversations
direction           inbound | outbound
channel             sms | email | webchat
body                text
media_urls          text[] (nullable — MMS/image attachments)
sent_by             FK → org_members (nullable — null for inbound or automation)
is_internal_note    boolean, default false
twilio_message_sid  text (nullable)
status              sent | delivered | failed | received
sent_at             timestamp
created_at
```

**Rules:**

- `is_internal_note = true` messages are never sent externally
- `sender_id` is null for inbound messages from contacts
- `status` values `sent | delivered | failed | received` cover v1 channels. Future email channel support will require `queued` and `bounced` — enum should be designed to accommodate extension
- Messages are never deleted — immutable communication record

---

## DOMAIN 6 — Revenue

---

### `quotes`

**Purpose:** A priced proposal sent to a contact.

**Key Fields:**

```
id                UUID, primary key
org_id            FK → organizations
contact_id        FK → contacts
opportunity_id    FK → opportunities (nullable)
issued_by         FK → org_members
quote_number      INTEGER (e.g. 42) — stored as raw integer, formatted as Q-0042 at display time
status            draft | sent | viewed | accepted | declined | expired
subtotal          decimal
tax_rate          decimal (nullable)
tax_amount        decimal, default 0
total             decimal
deposit_required  boolean, default false
deposit_amount    decimal (nullable)
notes             text (nullable — client-visible)
internal_notes    text (nullable — team only)
expires_at        timestamp (nullable)
sent_at           timestamp (nullable)
accepted_at       timestamp (nullable)
declined_at       timestamp (nullable)
created_at
updated_at
deleted_at
```

**Lifecycle:**

```
draft → sent → viewed → accepted
                      → declined
             → expired
```

**Rules:**

- `opportunity_id` is optional — quotes can be created directly from a contact
- Quote acceptance does NOT automatically move the opportunity to Won or create a job
- When accepted: `quote.accepted` event emitted → contractor receives notification → staff manually advances the opportunity to Won when operationally ready (deposit cleared, materials confirmed, scheduling confirmed)
- This decoupling prevents premature job creation before the contractor is operationally ready
- `quote_number` is org-scoped sequential — `UNIQUE(org_id, quote_number)`. Numbers are never reused even after soft delete
- Soft delete only

---

### `quote_line_items`

**Purpose:** Individual line items on a quote.

**Key Fields:**

```
id            UUID, primary key
org_id        FK → organizations
quote_id      FK → quotes
description   text
quantity      decimal
unit_price    decimal
total         decimal — stored computed value (quantity × unit_price)
position      integer — display order
created_at
updated_at
```

---

### `quote_views`

**Purpose:** View tracking for the quote-viewed notification. Records every qualifying view.

**Key Fields:**

```
id                    UUID, primary key
quote_id              FK → quotes
org_id                FK → organizations
viewed_at             timestamp
ip_hash               text — one-way hash, never raw IP
user_agent_hash       text — one-way hash
notification_sent     boolean, default false
notification_sent_at  timestamp (nullable)
```

**Rules:**

- Contractor's own session excluded from triggering notifications
- Repeat requests within 60 seconds from same `ip_hash` are excluded
- All views are logged — `notification_sent` tracks if the alert fired
- Raw IP is never stored — only a non-reversible hash

---

### `invoices`

**Purpose:** A payment request issued to a contact.

**Key Fields:**

```
id                       UUID, primary key
org_id                   FK → organizations
contact_id               FK → contacts
job_id                   FK → jobs (nullable)
opportunity_id           FK → opportunities (nullable)
quote_id                 FK → quotes (nullable — set if created from a quote)
issued_by                FK → org_members
invoice_number           INTEGER (e.g. 42) — stored as raw integer, formatted as INV-0042 at display time
status                   draft | sent | partially_paid | paid | overdue | cancelled
subtotal                 decimal
tax_rate                 decimal (nullable)
tax_amount               decimal, default 0
total                    decimal
amount_paid              decimal, default 0
amount_due               decimal — stored: total minus amount_paid
due_date                 date (nullable)
stripe_payment_link_url  text (nullable)
sent_at                  timestamp (nullable)
paid_at                  timestamp (nullable)
created_at
updated_at
deleted_at
```

**Lifecycle:**

```
draft → sent → partially_paid → paid
             → overdue
             → cancelled
```

**Rules:**

- `job_id` and `opportunity_id` are both optional
- `payments` table is the authoritative source of truth for all financial balances — `amount_paid` and `amount_due` on this table are denormalized convenience values only. They must never be mutated directly — they are always derived by summing `payments.amount` for this invoice
- `amount_due` is recalculated whenever a payment is recorded
- When `amount_due = 0`: `status → paid`, `paid_at` set, `invoice.paid` event emitted
- `invoice_number` is org-scoped sequential — `UNIQUE(org_id, invoice_number)`. Numbers are never reused even after soft delete
- Soft delete only

---

### `invoice_line_items`

**Purpose:** Individual line items on an invoice. Identical structure to quote line items.

**Key Fields:**

```
id            UUID, primary key
org_id        FK → organizations
invoice_id    FK → invoices
description   text
quantity      decimal
unit_price    decimal
total         decimal
position      integer
created_at
updated_at
```

---

### `payments`

**Purpose:** A single payment event against an invoice. Supports partial payments and deposits.

**Key Fields:**

```
id                        UUID, primary key
org_id                    FK → organizations
invoice_id                FK → invoices
recorded_by               FK → org_members
amount                    decimal
method                    stripe | cash | check | bank_transfer | other
stripe_payment_intent_id  text (nullable)
stripe_charge_id          text (nullable)
note                      text (nullable)
paid_at                   timestamp
created_at
```

**Rules:**

- Multiple payments per invoice are supported
- When recorded: `invoice.amount_paid` and `invoice.amount_due` recalculated immediately
- `stripe_payment_intent_id` has a `UNIQUE` constraint — Stripe webhook idempotency guard. If a `payment_intent.succeeded` webhook fires twice, the second insert fails gracefully. No double-payment possible
- Payments are never deleted — immutable financial record
- No `updated_at` or `deleted_at` — intentionally immutable

---

### `quote_templates`

**Purpose:** Reusable quote templates with pre-built line items. Allow contractors to build common job quotes in seconds without re-entering recurring services.

**Key Fields:**

```
id            UUID, primary key
org_id        FK → organizations
name          text (e.g. "Standard Roof Inspection", "HVAC Full Service")
notes         text (nullable — default client-visible notes for this template)
created_by    FK → org_members
created_at
updated_at
deleted_at
```

**Rules:**

- Soft delete only — deleting a template does not affect quotes already created from it
- Applying a template to a new quote copies all template line items into `quote_line_items` — after that the quote is fully independent
- No FK from quote back to template — quotes are standalone once created

---

### `quote_template_line_items`

**Purpose:** Individual line items on a quote template.

**Key Fields:**

```
id            UUID, primary key
org_id        FK → organizations
template_id   FK → quote_templates
description   text
quantity      decimal
unit_price    decimal
total         decimal — stored computed value (quantity × unit_price)
position      integer — display order
created_at
updated_at
```

**Rules:**

- When parent `quote_templates` row is soft-deleted (`deleted_at` set): all child `quote_template_line_items` rows are also soft-deleted at application level in the same transaction. PostgreSQL cascade does not fire on `deleted_at` updates — application must handle this explicitly
- `total` is a stored computed value — updated at application level when quantity or unit_price changes

---

## DOMAIN 7 — Appointments

---

### `appointments`

**Purpose:** A scheduled interaction between the org and a contact.

**Key Fields:**

```
id                    UUID, primary key
org_id                FK → organizations
contact_id            FK → contacts
job_id                FK → jobs (nullable — estimate visits exist before a job)
assigned_to           FK → org_members (nullable)
type                  estimate | job_start | follow_up | inspection | other
title                 text
status                scheduled | completed | cancelled | no_show
start_at              timestamp
end_at                timestamp (nullable)
location              text (nullable)
notes                 text (nullable)
reminder_24h_sent     boolean, default false
reminder_1h_sent      boolean, default false
created_at
updated_at
deleted_at
```

**Rules:**

- `job_id` is nullable — estimate appointments have no job yet
- `assigned_to` scopes Member visibility
- `type` determines how the appointment appears in the UI and what automation fires after completion
- `location` defaults to the linked job's `service_address` when `job_id` is present — but remains independently editable for off-site meetings, calls, or pre-job visits where the location differs
- `reminder_*_sent` flags prevent duplicate BullMQ reminder fires
- On any reschedule (`start_at` updated): both `reminder_24h_sent` and `reminder_1h_sent` reset to `false` — existing BullMQ reminder jobs cancelled and re-created for the new time
- Soft delete only

---

## DOMAIN 8 — Reputation

---

### `review_requests`

**Purpose:** The entry point to the smart review funnel. Sent after job completion.

**Key Fields:**

```
id                UUID, primary key
org_id            FK → organizations
contact_id        FK → contacts
job_id            FK → jobs — UNIQUE constraint (one request per job)
sent_by_automation   boolean, default false
sent_by_member_id    FK → org_members (nullable — set for manual sends)
status            pending | sent | responded | failed | no_response
response_score    integer 1-5 (nullable)
sent_at           timestamp (nullable)
responded_at      timestamp (nullable)
created_at
updated_at
```

**Lifecycle:**

```
pending → sent → responded
                  → score ≥ 4 → reviews row created
                  → score ≤ 3 → private_feedback row created
        → no_response
```

**Rules:**

- Created by BullMQ when `job.completed` fires
- One review request per job — enforced by `UNIQUE(job_id)` database constraint AND application level
- `sent_by_automation = true` for BullMQ-triggered requests; `sent_by_member_id` populated for manual sends

---

### `reviews`

**Purpose:** A positive review record — the positive outcome of the review funnel.

**Key Fields:**

```
id                  UUID, primary key
org_id              FK → organizations
review_request_id   FK → review_requests
contact_id          FK → contacts
platform            google | facebook | other
rating              integer 1-5
body                text (nullable)
review_url          text (nullable)
received_at         timestamp
created_at
```

**Rules:**

- Immutable — never deleted
- `review_url` populated when the public review is confirmed

---

### `private_feedback`

**Purpose:** Negative feedback captured privately before it becomes a public review.

**Key Fields:**

```
id                  UUID, primary key
org_id              FK → organizations
review_request_id   FK → review_requests
contact_id          FK → contacts
body                text
is_resolved         boolean, default false
score               INTEGER CHECK (score >= 1 AND score <= 3)
resolved_by         FK → org_members (nullable)
resolved_at         timestamp (nullable)
submitted_at        timestamp
created_at
updated_at
```

**Rules:**

- Visible to Admin and Manager only via `can_view_negative_feedback`
- `body` is immutable after submission — cannot be edited
- `is_resolved` manually set by Admin or Manager after addressing the complaint

---

## DOMAIN 9 — Files & Media

---

### `media`

**Purpose:** Metadata record for every file stored in Cloudflare R2. Database stores paths only — never binary content.

**Key Fields:**

```
id                  UUID, primary key
org_id              FK → organizations
job_id              FK → jobs (nullable)
quote_id            FK → quotes (nullable — set for quote_attachment purpose_tag)
invoice_id          FK → invoices (nullable — set for invoice_attachment purpose_tag)
uploaded_by         FK → org_members
r2_key              text — original file path in R2
thumbnail_key       text (nullable — 300px version)
web_key             text (nullable — 1200px optimized version)
original_filename   text
file_size_bytes     integer
media_type          photo | pdf | attachment
mime_type           text
purpose_tag         job_photo | before | after | marketing_asset |
                    quote_attachment | invoice_attachment
created_at
deleted_at
```

**Rules:**

- On upload: Sharp processes server-side → three R2 objects created → one `media` row inserted
- On deletion: R2 objects must also be removed — handled by a cleanup job
- `purpose_tag = quote_attachment` requires `quote_id` to be set
- `purpose_tag = invoice_attachment` requires `invoice_id` to be set
- `purpose_tag = marketing_asset` makes the file available to agency for GBP and social content
- Soft delete only

---

## DOMAIN 10 — Growth, Automation & System

---

### `growth_feed_items`

**Purpose:** Contractor-visible record of significant agency deliverables. Read-only for all contractor roles.

**Key Fields:**

```
id                UUID, primary key
org_id            FK → organizations
created_by        text — agency operator identifier
type              gbp_post | seo | social | website | blog |
                  review_response | monthly_summary
title             text
body              text
media_url         text (nullable)
platform_badge    google | facebook | instagram | website (nullable)
metrics_snapshot  JSONB (nullable)
published_at      timestamp
created_at
```

**Rules:**

- Insert-only from contractor app perspective
- Currently written by agency team directly into the database
- Never deleted — permanent record of agency work
- No contractor-facing API route allows writes to this table
- `type = monthly_summary` items are generated automatically by a scheduled cron job on the first day of each month. The cron aggregates the prior month's metrics: review count and rating delta, lead count, revenue collected, growth feed items published, and significant milestones. One summary item is created per org per month

---

### `internal_activity_log`

**Purpose:** Agency-internal micro-task log. Never visible to contractors under any circumstances.

**Key Fields:**

```
id              UUID, primary key
org_id          FK → organizations
created_by      text — agency operator identifier
activity_type   health_check | monitoring | note | micro_task | competitor_review
description     text
created_at
```

**Rules:**

- No RLS policy ever grants contractor users access to this table
- Insert-only — immutable log record
- Never exposed via any Contractor App API route

---

### `notifications`

**Purpose:** In-app notification records for specific org members.

**Key Fields:**

```
id              UUID, primary key
org_id          FK → organizations
member_id       FK → org_members
type            new_lead | quote_viewed | quote_accepted | payment_received |
                appointment_booked | new_review | negative_feedback |
                missed_call_handled
title           text
body            text
resource_type   contact | quote | invoice | job | appointment | review (nullable)
resource_id     UUID (nullable — links to the relevant entity)
is_read         boolean, default false
read_at         timestamp (nullable)
created_at
```

**Rules:**

- Delivered via Supabase Realtime to the member's active session
- `resource_type` + `resource_id` form a polymorphic navigation reference — clicking the notification navigates to that entity. If the referenced entity has been soft-deleted, the app must handle the resulting 404 gracefully
- Members only receive notifications scoped to their org
- Notifications older than 90 days are purged by the nightly cron job, regardless of read status. Unread notifications are included in the purge.

---

### `automation_jobs`

**Purpose:** Audit and tracking record for every BullMQ automation job.

**Key Fields:**

```
id              UUID, primary key
org_id          FK → organizations
type            missed_call_textback | speed_to_lead | quote_followup |
                invoice_reminder | review_request | appointment_reminder
status          pending | processing | completed | failed | cancelled
resource_type   contact | quote | invoice | job | appointment | conversation
resource_id     UUID — entity that triggered this automation
bull_job_id     text — BullMQ internal job ID
scheduled_for   timestamp
started_at      timestamp (nullable)
completed_at    timestamp (nullable)
attempts        integer, default 0
last_error      text (nullable)
created_at
updated_at
```

**Rules:**

- One row per BullMQ job — created before the job is enqueued
- `status` updated by the BullMQ worker as job progresses
- `bull_job_id` links DB record to the BullMQ queue for management
- Max retry attempts: 3 by default for all automation types — configurable per type at the worker level. After 3 failed attempts `status → failed` and `last_error` is recorded. No further retries
- Never deleted — permanent automation audit trail

**Future (post-v1):**

- `job_status_history` table — structured audit trail of operational job status transitions (who changed status, when, from what). Currently partially covered by the contact activity timeline union query. Required when contractors need "when was this scheduled? who marked it complete?" reporting

---

### `outbox_events`

**Purpose:** Durable transactional event dispatch layer. Guarantees that business state changes and their async side effects are always consistent. Written inside the same database transaction as the business operation. Consumed by the outbox worker which dispatches to BullMQ. This is Layer 2 of the three-layer architecture.

**Key Fields:**

```
id                  UUID, primary key
org_id              FK → organizations (nullable — null for platform-level events such as monthly cron, org status transitions)
event_type          text — e.g. 'job.completed', 'quote.accepted', 'invoice.paid'
event_version       integer, default 1 — payload schema version for forward compatibility
resource_type       text — e.g. 'job', 'quote', 'opportunity', 'invoice'
resource_id         UUID — the entity that triggered this event
payload             JSONB — event-specific data (schema defined in Event System Architecture v1)
status              pending | processing | processed | failed | dead_lettered
attempts            integer, default 0
max_attempts        integer, default 3
sequence            integer — auto-increment within transaction for strict ordering
available_at        timestamp, default now() — supports delayed dispatch
processed_at        timestamp (nullable)
dead_lettered_at    timestamp (nullable)
last_error          text (nullable)
idempotency_key     text — UNIQUE — see idempotency rules below
created_at
updated_at
```

**Lifecycle:**

```
pending → processing → processed
                     → failed (retriable — attempts < max_attempts)
                     → dead_lettered (attempts = max_attempts — needs manual review)
```

**Idempotency Key Strategy:**

```
Domain events (fire once per lifecycle transition):
  {event_type}:{resource_id}
  Examples:
    job.completed:abc-123
    quote.accepted:def-456
    invoice.paid:ghi-789

Scheduled automation events (may recur on same resource):
  {event_type}:{automation_job_id}
  Examples:
    quote.followup:bullmq-job-id-001
    invoice.reminder:bullmq-job-id-002
    appointment.reminder:bullmq-job-id-003
```

**Rules:**

- Written atomically inside the same DB transaction as the business operation — never written after commit
- `outbox_events` IS NOT `automation_jobs` — they have different responsibilities:
  - `outbox_events`: guarantees dispatch happens (Layer 2 infrastructure)
  - `automation_jobs`: records what happened (audit trail)
- Outbox worker claims rows using `SELECT ... FOR UPDATE SKIP LOCKED` — safe for multiple worker instances
- Worker is woken by `pg_notify` on INSERT — falls back to 30-second polling for resilience
- Dead-lettered events surface in the `/jafar` super admin panel for manual inspection and retry
- `org_id = null` is valid for platform-level events (monthly cron, system maintenance)
- `sequence` column ensures correct processing order when multiple events are inserted in the same transaction
- Never deleted — permanent dispatch audit trail

---

### `org_counters`

**Purpose:** Per-org sequential counters for human-readable quote and invoice numbers. One row per org. Incremented with `SELECT ... FOR UPDATE` to prevent race conditions on concurrent number generation.

**Key Fields:**

```
org_id              UUID, primary key, FK → organizations
next_quote_number   integer, default 1
next_invoice_number integer, default 1
created_at
updated_at
```

**Generation Flow:**

```sql
BEGIN;
  SELECT next_quote_number FROM org_counters WHERE org_id = ? FOR UPDATE;
  UPDATE org_counters SET next_quote_number = next_quote_number + 1 WHERE org_id = ?;
  -- use new counter value to generate: Q-0042
COMMIT;
```

**Rules:**

- One row per org — created automatically when org is created
- `FOR UPDATE` lock prevents concurrent counter generation races
- Counter values are never decremented — even if a quote or invoice is soft-deleted, its number is retired permanently
- Numbers are formatted at application level: `Q-{zero_padded_counter}`, `INV-{zero_padded_counter}`

---

# 4. Relationship Map

```
organizations
├── org_members             (org_id → one-to-many)
├── automation_settings     (org_id → one-to-one)
├── pipeline_stages         (org_id → one-to-many)
├── quote_templates         (org_id → one-to-many)
│   └── quote_template_line_items (template_id → one-to-many)
├── contacts                (org_id → one-to-many)
│   ├── contact_addresses   (contact_id → one-to-many)
│   ├── contact_notes       (contact_id → one-to-many)
│   ├── opportunities       (contact_id → one-to-many)
│   │   └── jobs            (opportunity_id → one-to-one)
│   │       ├── media            (job_id → one-to-many)
│   │       ├── appointments     (job_id → one-to-many, nullable)
│   │       ├── invoices         (job_id → one-to-many, nullable)
│   │       └── review_requests  (job_id → one-to-one, UNIQUE)
│   │           ├── reviews           (review_request_id → one-to-one)
│   │           └── private_feedback  (review_request_id → one-to-one)
│   ├── conversations       (contact_id → one-to-many)
│   │   └── messages        (conversation_id → one-to-many)
│   ├── quotes              (contact_id → one-to-many)
│   │   ├── quote_line_items (quote_id → one-to-many)
│   │   ├── quote_views      (quote_id → one-to-many)
│   │   └── media            (quote_id → one-to-many, nullable, quote_attachment)
│   ├── invoices            (contact_id → one-to-many)
│   │   ├── invoice_line_items (invoice_id → one-to-many)
│   │   ├── payments           (invoice_id → one-to-many)
│   │   └── media              (invoice_id → one-to-many, nullable, invoice_attachment)
│   └── appointments        (contact_id → one-to-many)
├── growth_feed_items       (org_id → one-to-many)
├── internal_activity_log   (org_id → one-to-many)
├── notifications           (org_id → one-to-many)
└── automation_jobs         (org_id → one-to-many)
```

## Assignment Links (cross-entity, org_members as assignee)

```
org_members.id referenced as assigned_to on:
→ contacts        who is working this lead right now
→ opportunities   who owns this deal
→ jobs            which field member is doing the work
→ conversations   which team member handles this thread
→ appointments    which field member is attending
```

## Optional Foreign Keys (nullable by design)

```
quotes.opportunity_id      quotes can exist without a pipeline opportunity
invoices.job_id            invoices can exist without a job
invoices.opportunity_id    invoices can exist without a pipeline opportunity
invoices.quote_id          invoices can exist without originating from a quote
appointments.job_id        estimate appointments exist before a job is created
media.job_id               org-level media not tied to a specific job
media.quote_id             media not tied to a specific quote (nullable unless purpose_tag = quote_attachment)
media.invoice_id           media not tied to a specific invoice (nullable unless purpose_tag = invoice_attachment)
```

---

# 5. Core Business Flow — Data Trail

How the core business loop moves through entities end-to-end:

```
1. LEAD ARRIVES
   contacts row created         (status = 'lead')
   conversations row created    (channel = lead source)
   opportunities row created    (stage_id = default stage)
   notifications row created    (type = 'new_lead')
   automation_jobs row created  (type = 'speed_to_lead') → SMS fires

2. COMMUNICATION
   messages rows appended       to conversation
   conversations.last_message_at updated
   conversations.unread_count   managed per read/unread state

3. APPOINTMENT BOOKED
   appointments row created     (job_id = null — no job yet)
   automation_jobs row created  (type = 'appointment_reminder')
   notifications row created    (type = 'appointment_booked')

4. QUOTE SENT
   quotes row created           (status draft → sent)
   quote_line_items rows created
   opportunities.stage_id       advanced to Quoted stage
   automation_jobs row created  (type = 'quote_followup')

5. QUOTE VIEWED
   quote_views row created
   notifications row created    (type = 'quote_viewed')
   automation_jobs followup     cancelled if qualifying view

6. QUOTE ACCEPTED
   quotes.status = 'accepted'   accepted_at set
   quote.accepted event emitted
   automation_jobs followup     cancelled

7. OPPORTUNITY WON
   opportunities moved to Won stage
   opportunities.closed_at      set
   jobs row created             (opportunity_id, contact_id copied)
   contacts.status              updated to 'customer'
   appointments.job_id          linked if estimate appointment exists

8. INVOICE SENT
   invoices row created         (from quote or fresh)
   invoice_line_items rows created
   automation_jobs row created  (type = 'invoice_reminder') if overdue

9. PAYMENT RECEIVED
   payments row created
   invoices.amount_paid         updated
   invoices.amount_due          recalculated
   if amount_due = 0 →          invoices.status = 'paid', invoice.paid emitted
   automation_jobs reminder     cancelled
   notifications row created    (type = 'payment_received')

10. JOB COMPLETED
    jobs.status = 'completed'   completed_at set
    job.completed event emitted
    automation_jobs row created (type = 'review_request')

11. REVIEW FUNNEL
    review_requests row created (pending → sent)
    Contact responds:
    score ≥ 4 → reviews row created   → Google link delivered
    score ≤ 3 → private_feedback row  → contractor notified internally
    notifications row created         (type = 'new_review' or 'negative_feedback')

12. GROWTH VISIBLE
    growth_feed_items rows inserted by agency team
    Contractor reads Growth Feed → sees proof of agency work → trust compounds
```

---

# 6. Contact Activity Timeline

The contact detail view shows a unified chronological activity timeline. This is **not a separate table**. It is assembled at query time by unioning relevant events across entities, all filtered by `contact_id` and `org_id`.

**Timeline event sources:**

```
messages           "SMS received — Hey, I need a quote for..."
messages           "SMS sent — Thanks for reaching out..."
quotes             "Quote Q-0042 sent — $4,500"
quote_views        "Quote Q-0042 viewed"
quotes             "Quote Q-0042 accepted"
invoices           "Invoice INV-0042 sent — $4,500"
payments           "Payment received — $2,250"
invoices           "Invoice INV-0042 paid in full"
appointments       "Appointment scheduled — May 15 at 9:00am"
appointments       "Appointment completed"
jobs               "Job created — Roof Replacement 123 Main St"
jobs               "Job completed"
review_requests    "Review request sent"
reviews            "5-star review received"
private_feedback   "Negative feedback received"
contact_notes      "Note by Sarah: Customer prefers contact after 2pm"
automation_jobs    "Missed call text-back sent"
```

Each entry includes: event type, timestamp, description, and a deep link to the full entity.

**Pagination:** The timeline query must use cursor-based pagination
(e.g., `WHERE created_at < :cursor ORDER BY created_at DESC LIMIT 50`)
across the union of all source tables. Offset-based pagination
is not suitable. The API response must include a `next_cursor` value.

---

# 7. Three-Layer Architecture

This system operates across three distinct layers with explicit responsibilities and hard boundaries between them.

```
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — TRANSACTIONAL CORE                                       │
│  PostgreSQL + Drizzle ORM                                           │
│                                                                     │
│  Responsible for:                                                   │
│  → Source of truth for all business state                          │
│  → Atomic multi-table operations                                    │
│  → Constraints, indexes, RLS                                        │
│  → outbox_events insertion (inside transaction)                     │
│                                                                     │
│  NEVER responsible for:                                             │
│  → Sending SMS, email, or push notifications                       │
│  → Enqueueing BullMQ jobs directly                                  │
│  → Calling external APIs                                            │
└─────────────────────────────────────────────────────────────────────┘
                              │ COMMIT includes outbox_events row
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 2 — RELIABLE ASYNC INFRASTRUCTURE                            │
│  outbox_events + Outbox Worker + BullMQ + Redis                     │
│                                                                     │
│  Responsible for:                                                   │
│  → Guaranteed at-least-once event delivery                          │
│  → Retry semantics and dead-letter handling                         │
│  → Automation orchestration                                         │
│  → Async fanout (notifications, SMS, email)                         │
│  → Idempotency enforcement                                          │
│                                                                     │
│  NEVER responsible for:                                             │
│  → Business state mutations without going through Layer 1           │
│  → Real-time UI delivery (that is Layer 3)                          │
└─────────────────────────────────────────────────────────────────────┘
                              │ BullMQ worker inserts notifications row
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 3 — REACTIVE UX LAYER                                        │
│  Supabase Realtime                                                  │
│                                                                     │
│  Responsible for:                                                   │
│  → Live in-app notification delivery                                │
│  → Inbox real-time message updates                                  │
│  → Dashboard live refreshes                                         │
│  → UI state synchronization                                         │
│                                                                     │
│  NEVER responsible for:                                             │
│  → Durable automation processing                                    │
│  → Business-critical orchestration                                  │
│  → Retry guarantees                                                 │
│  → Replacing outbox_events                                          │
└─────────────────────────────────────────────────────────────────────┘
```

**Critical rule:** Supabase Realtime is NOT an event bus. It is a UI delivery mechanism only. A missed Realtime notification is a UX inconvenience. A missed outbox event is a business failure. They must never be confused.

---

# 8. Key Architectural Rules

Non-negotiable rules that govern every schema, API, and RLS decision in all subsequent phases.

```
Rule 1 — Tenant Isolation
Every table has org_id.
No query ever returns rows from a different org.
Enforced at RLS level and API middleware level simultaneously.

Rule 2 — Soft Deletes
All major entities use deleted_at.
Immutable records (payments, messages, reviews, automation_jobs)
have no deleted_at — they are never deleted.

Rule 3 — Permission Source of Truth
Boolean columns on org_members are the only permission authority.
The role column is never used for runtime access control.
It exists for UI template display only.
All runtime permission checks must be routed through a centralized
permission utility rather than reading boolean columns directly.

Rule 4 — Single Assignee
assigned_to is a single UUID FK everywhere.
No join tables for assignment in v1.

Rule 5 — Job Creation
Jobs are never created manually.
They are always and only created by the Won stage trigger.

Rule 6 — Contact Deduplication
Phone number is the deduplication key per org.
One contact per phone number per org.
Phone must be normalized to E.164 format at write time before the dedup check fires.
Duplicate check fires on every contact creation and every inbound lead.

Rule 7 — Optional Pipeline Links
quotes.opportunity_id and invoices.job_id are nullable by design.
Revenue entities are independent — they do not require pipeline context.

Rule 8 — Financial Immutability
payments rows are never edited or deleted after creation.
They are the source of truth for invoice reconciliation.
invoice.amount_paid and invoice.amount_due are always derived from payments.
UNIQUE constraint on stripe_payment_intent_id prevents double-payment on webhook retry.

Rule 9 — Super Admin Isolation
The Platform Owner has no org_id, no org_member row, no Supabase Auth record.
Super admin access is enforced at server route middleware only.
The service role is the only DB credential used in /jafar routes.

Rule 10 — RLS Alongside Schema
RLS policies are designed in the same phase as the schema.
No table is ever created without its corresponding RLS policy.

Rule 11 — No NULL in Permission Columns
Every permission column on org_members is always TRUE or FALSE — never NULL.
Admin accounts: all 39 columns seeded TRUE at creation.
Manager/Member accounts: all 39 columns seeded from role template as explicit TRUE or FALSE.
Three-state boolean logic in authorization is forbidden.

Rule 12 — Assignment Preservation on Member Deactivation
When a team member is deactivated (is_active = false) or soft-deleted,
assigned_to references are NEVER automatically nulled out.
Historical assignments are preserved for audit, attribution, commission, and reporting accuracy.
The Admin UI surfaces "assigned to inactive member" warnings and bulk reassignment tools.
Nulling assignments silently destroys accountability history.

Rule 13 — Contact Address Separation
contacts holds identity only — no address fields on the contacts table.
All addresses live in contact_addresses with a label and is_primary flag.
When a job is created: the contact's primary service address is snapshot-copied
into the job's service_address fields.
After that point the job address is fully independent.
If a contact's address changes, completed job records are unaffected.

Rule 14 — SMS Opt-Out Enforcement
sms_opt_out = true on a contact must block ALL outbound automated SMS.
BullMQ automation workers must check this flag before enqueuing any SMS job.
This is a TCPA compliance requirement — not optional.

Rule 15 — Pipeline Stage Constraints
Exactly one stage per org must have is_won = true.
Exactly one stage per org must have is_lost = true.
Exactly one stage per org must have is_default = true.
Enforced by partial unique indexes in the database — not just application logic.

Rule 16 — Appointment Reminder Reset on Reschedule
When an appointment's start_at is updated:
reminder_24h_sent and reminder_1h_sent must both reset to false.
Existing BullMQ reminder jobs must be cancelled and re-created for the new time.
Failure to reset these flags silently prevents reminders from firing after reschedule.

Rule 17 — v1 Scope Boundaries
USD only — no currency field on any financial entity.
One pipeline per org — no pipeline_id on pipeline_stages.
No refunds table — payment reversals are out of scope for v1.
These are intentional decisions, not oversights.

Rule 18 — Quote Template Independence
Applying a quote template to a new quote copies line items into quote_line_items.
After that the quote is fully independent — no FK back to the template.
Deleting a template never affects quotes already created from it.
When a template is soft-deleted, its line items are soft-deleted in the same transaction.
PostgreSQL cascade does not fire on deleted_at — application handles this explicitly.

Rule 19 — Quote Acceptance Is Decoupled From Won
Quote acceptance fires a notification to the contractor only.
It does NOT automatically advance the opportunity stage.
It does NOT automatically create a job.
Staff manually moves the opportunity to Won when operationally ready.
This prevents premature job creation before deposits, materials, and scheduling are confirmed.

Rule 20 — jobs.opportunity_id Is NOT NULL and UNIQUE
Every job is always created from an opportunity — opportunity_id is NOT NULL.
UNIQUE(opportunity_id) is a database constraint on jobs.
Duplicate jobs from concurrent Won-stage transitions, webhook retries, and automation
replays are structurally impossible.

Rule 21 — Sequential Numbers Are Never Reused
`quote_number` and `invoice_number` use full unique indexes (no `WHERE` clause). Numbers are permanently consumed, even after soft delete.
Soft-deleted quotes and invoices permanently consume their number.
Numbers are never recycled — this preserves accounting integrity and client trust.

Rule 22 — Notifications Have a 90-Day Retention Policy
Notifications older than 90 days are purged by the nightly cron job,
regardless of read status. Unread notifications are included in the purge.
Polymorphic resource references that point to soft-deleted entities must be
handled gracefully by the UI — show a "this item has been removed" state.

Rule 23 — pipeline_stages Are Soft-Deleted Only
Stages are never hard-deleted.
A stage cannot be soft-deleted while live opportunities exist in it.
Partial unique indexes enforce single is_won, is_lost, is_default per org.

Rule 24 — Org Deletion Cascade Order Is Defined
Application-level cron handles org deletion in explicit FK-safe order.
See organizations entity rules for the complete 30-table deletion sequence.
org_members rows are NEVER hard-deleted in normal operation — soft delete only. During the final org deletion cron sequence, org_members are hard-deleted as part of the explicit cascade order.

Rule 25 — org_members.email Is Read-Only
email on org_members is denormalized from Supabase Auth.
It must never be mutated directly on the org_members row.
All email changes go through Supabase Auth and trigger a corresponding update.

Rule 26 — conversations.unread_count Is Reconcilable
unread_count is a stored denormalized integer for query performance.
If drift is detected: reconcile by counting messages WHERE direction = 'inbound'
AND read_at IS NULL for that conversation. Never trust it blindly in financial
or permission-critical logic.

Rule 27 — RLS Is Not the Primary Authorization System
RLS guarantees tenant isolation and baseline row protection.
RLS does NOT enforce fine-grained permissions.
Responsibility split is absolute:

  RLS enforces:
    - org_id tenant isolation on every table
    - baseline: users can only see their own org's data

  API middleware enforces:
    - all 39 fine-grained permission checks
    - assignment-aware visibility (assigned_to = user_id for Members)
    - feature-level access rules
    - business rule authorization

  JWT contains:
    - org_id (for RLS and tenant routing)
    - role (for coarse awareness only)
    - Never the 39 permission booleans

**JWT Custom Claim Injection (MANDATORY)**

Supabase does NOT include `org_id` in JWTs by default.
Before any RLS policy is written, the org_id must be injected into
every user's JWT. Two approaches are available:

- **Option A (Pro plan):** A Supabase Auth Hook (Postgres function) that
  reads `org_members.org_id` using `auth.uid()` on every token refresh.

- **Option B (any plan, including Free):** Store `org_id` in the user's
  `app_metadata` via `supabase.auth.admin.updateUserById()` at account
  creation time. `app_metadata` is automatically included in the JWT
  without any hook.

In both cases, the JWT will contain `{ org_id: …, role: … }`.

`role` is included in the JWT for coarse UI awareness only.
It is NEVER used for permission checks — those always read
the boolean columns on `org_members` at the API layer.

**Recommendation for v1:** Use the app_metadata approach (Option B).
It works on all Supabase plans and requires no infrastructure setup.
If real-time permission sync is needed in the future, upgrade to
the Auth Hook approach (Option A). RLS policies remain identical
under both approaches.

Rule 28 — Transaction Boundary Law
Every business operation that has side effects must follow this pattern:

  INSIDE the database transaction:
    - all business row mutations
    - outbox_events row insertion

  OUTSIDE the database transaction (via outbox worker):
    - BullMQ job enqueue
    - Twilio SMS dispatch
    - Resend email dispatch
    - Supabase Realtime publish
    - any external API call

Never enqueue BullMQ, send SMS, or call external services inside
a database transaction. If the transaction rolls back, the external
call cannot be undone. The outbox pattern is the only correct boundary.

Rule 29 — outbox_events Is the Reliability Contract
outbox_events guarantees at-least-once event delivery.
All consumers (BullMQ workers, notification handlers, webhook processors)
must be idempotent — safe to receive the same event multiple times.
outbox_events is NOT automation_jobs. They have different responsibilities:
  outbox_events:   dispatch guarantee (infrastructure)
  automation_jobs: execution audit trail (observability)
Both must exist. Neither replaces the other.

Rule 30 — Dead-Lettered Events Require Operational Response
When outbox_events.status reaches dead_lettered:
  - the event is surfaced in the /jafar super admin panel
  - the Platform Owner can inspect the last_error and payload
  - manual retry is possible via the admin panel
  - the affected org may need operational follow-up
Dead-lettered events must never be silently ignored.
They represent a business operation that failed to complete.
```

---

# 9. What Is Now Unlocked

The domain architecture resolves every major ambiguity ahead of schema design.

| Decision                    | Resolved By This Document                                                      |
| --------------------------- | ------------------------------------------------------------------------------ |
| Total table count           | 30 confirmed                                                                   |
| All nullable FKs            | Documented with reasoning                                                      |
| All NOT NULL FKs            | Documented explicitly (`jobs.opportunity_id`)                                  |
| All enum value sets         | Defined per entity                                                             |
| All entity lifecycle states | Defined per entity                                                             |
| Contact deduplication       | `UNIQUE(org_id, phone)`                                                        |
| Contact address model       | Separate `contact_addresses` — partial unique index on `is_primary`            |
| Job address model           | Snapshot fields — historically immutable                                       |
| Activity timeline           | Union query — no separate table — known scale boundary                         |
| Permission storage          | 39 boolean columns on `org_members` — always TRUE or FALSE, never NULL         |
| Permission seeding          | Admin = all TRUE. Manager/Member = explicit from role template                 |
| JWT claims                  | `org_id` + `role` only — never permission booleans                             |
| RLS responsibility          | Tenant isolation only — fine-grained checks at API middleware level            |
| Assignee pattern            | Single `assigned_to UUID` FK — preserved on member deactivation                |
| Financial immutability      | `payments` are source of truth — UNIQUE on `stripe_payment_intent_id`          |
| Automation audit            | `automation_jobs` table                                                        |
| Event dispatch              | `outbox_events` table — transactional guarantee                                |
| Sequential numbers          | `org_counters` table — `SELECT FOR UPDATE` increment                           |
| Idempotency keys            | Domain events: `{type}:{resource_id}`. Scheduled: `{type}:{automation_job_id}` |
| Outbox worker               | `FOR UPDATE SKIP LOCKED` + `pg_notify` + 30s fallback polling                  |
| Dead-letter                 | `dead_lettered` status — visible in `/jafar` — manual retry capability         |
| Event versioning            | `event_version integer default 1` on `outbox_events`                           |
| Three-layer architecture    | Layer 1: DB. Layer 2: outbox+BullMQ. Layer 3: Realtime UI only                 |
| Transaction boundary        | Business mutations + outbox INSERT inside transaction. Everything else outside |
| Agency-only isolation       | `internal_activity_log` — no contractor RLS access ever                        |
| Quote templates             | Copy-on-apply — fully independent after creation                               |
| Quote acceptance            | Decoupled from Won — notification only — staff advances manually               |
| Sequential number integrity | `UNIQUE(org_id, number)` — never reused                                        |
| SMS opt-out                 | `sms_opt_out` on `contacts` — checked by all BullMQ SMS workers                |
| Appointment type            | `type` enum — estimate, job_start, follow_up, inspection, other                |
| Appointment reminder reset  | `reminder_*_sent` reset to false on every reschedule                           |
| Review request uniqueness   | `UNIQUE(job_id)` on `review_requests`                                          |
| Pipeline stage constraints  | Partial unique indexes on `is_won`, `is_lost`, `is_default`                    |
| Pipeline stage deletion     | Soft delete only — blocked while live opportunities exist                      |
| Notifications retention     | 90-day — nightly cron purge                                                    |
| Growth feed monthly summary | Generated by cron on first day of each month                                   |
| Org deletion cascade        | Application-level cron — explicit 30-table deletion sequence                   |
| org_members hard delete     | Never — soft delete only                                                       |
| v1 scope boundaries         | USD only. One pipeline per org. No refunds table                               |

---

_Master Domain Architecture v1 — Final_ _30 entities. 10 domains. 30 architectural rules. Three-layer architecture defined._ _All relationships mapped. All lifecycle states defined. All edge cases resolved. All operational guarantees documented._ _Ready for Event System Architecture v1._
