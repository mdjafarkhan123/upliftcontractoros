# Schema Principles & Enum Definitions

This file is required reading before any domain file. It contains the 10 design
principles that govern every table and all 25 enum definitions with exact values.

---

## 10 Design Principles

These rules govern every table in the schema. Violating any is a schema bug.

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

## Tables WITHOUT Soft Delete (Intentional)

| Table                   | Reason                                              |
| ----------------------- | --------------------------------------------------- |
| `payments`              | Financial immutability. No refunds in v1.           |
| `quote_views`           | Append-only log. Immutable tracking record.         |
| `reviews`               | Immutable public review record.                     |
| `growth_feed_items`     | Permanent agency work log. Never deleted.           |
| `internal_activity_log` | Append-only audit log.                              |
| `notifications`         | Purged by cron at 90 days. Soft delete unnecessary. |

Additional tables without `deleted_at` (structural — one-per-org or append-only):
`messages`, `automation_jobs`, `outbox_events`, `automation_settings`, `org_counters`.

---

## All Enum Definitions

Every enum is defined here with exact values. When writing Drizzle schema, API
validation, or UI select options — use these exact values, in this exact order.

### Organization & Identity

```sql
CREATE TYPE org_status AS ENUM ('active', 'suspended', 'pending_deletion', 'deleted');
CREATE TYPE member_role AS ENUM ('admin', 'manager', 'member');

CREATE TYPE email_domain_status AS ENUM (
  'pending', 'verified', 'failed', 'dns_mismatch'
);
```

### Contacts

```sql
CREATE TYPE contact_status AS ENUM ('lead', 'customer', 'archived');
-- Lifecycle: lead → customer (auto when any opportunity is Won)
--            lead → archived  OR  customer → archived (manual)

CREATE TYPE address_label AS ENUM ('billing', 'service', 'mailing', 'other');

CREATE TYPE lead_source_type AS ENUM (
  'website_form', 'live_chat', 'missed_call', 'manual', 'referral', 'other'
);
```

### Jobs

```sql
CREATE TYPE job_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
```

### Communication

```sql
-- conversation_channel enum REMOVED in inbox v2. Channel now lives only on messages.
-- Conversations are transport-agnostic operational threads.

-- Messages within a conversation — includes missed_call (rendered as system row in UI).
CREATE TYPE message_channel AS ENUM ('sms', 'missed_call', 'email', 'webchat');

-- 'archived' removed; use 'closed' for finished threads.
CREATE TYPE conversation_status AS ENUM ('open', 'closed', 'snoozed');

CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');

-- queued and bounced used by email channel
CREATE TYPE message_status AS ENUM (
  'sent', 'delivered', 'failed', 'received', 'queued', 'bounced'
);
```

Internal notes are NOT a channel — they are represented by the
`messages.is_internal_note` boolean. Notes inherit the conversation's most
recent channel for storage continuity only.

### Revenue — Quotes

```sql
CREATE TYPE quote_status AS ENUM (
  'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'
);
```

### Revenue — Invoices & Payments

```sql
-- partially_paid: at least one payment received, balance still outstanding
CREATE TYPE invoice_status AS ENUM (
  'draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'
);

CREATE TYPE payment_method AS ENUM (
  'stripe', 'cash', 'check', 'bank_transfer', 'other'
);
```

### Appointments

```sql
CREATE TYPE appointment_type AS ENUM (
  'estimate', 'job_start', 'follow_up', 'inspection', 'other'
);

CREATE TYPE appointment_status AS ENUM (
  'scheduled', 'completed', 'cancelled', 'no_show'
);
```

### Reputation

```sql
CREATE TYPE review_request_status AS ENUM (
  'pending', 'sent', 'responded', 'failed', 'no_response'
);
```

### Files & Media

```sql
CREATE TYPE media_purpose_tag AS ENUM (
  'job_photo', 'before', 'after', 'marketing_asset',
  'quote_attachment', 'invoice_attachment',
  'email_attachment', 'avatar', 'org_logo'
);

CREATE TYPE media_type AS ENUM ('photo', 'pdf', 'attachment');
```

### Growth, Automation & System

```sql
CREATE TYPE automation_job_status AS ENUM (
  'pending', 'processing', 'completed', 'failed', 'cancelled'
);

CREATE TYPE automation_job_type AS ENUM (
  'missed_call_textback', 'speed_to_lead', 'quote_followup',
  'invoice_reminder', 'review_request', 'appointment_reminder'
);

CREATE TYPE outbox_event_status AS ENUM (
  'pending', 'processing', 'processed', 'failed', 'dead_lettered'
);

CREATE TYPE growth_feed_type AS ENUM (
  'gbp_post', 'seo', 'social', 'website', 'blog',
  'review_response', 'monthly_summary'
);
```
