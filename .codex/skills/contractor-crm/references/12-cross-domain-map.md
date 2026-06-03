# Cross-Domain Relationship Map

This file maps FK relationships across the schema, documents which domains
depend on which, and lists common multi-table query patterns Claude Code will encounter.

---

## Complete FK Relationship Map

Every FK in the schema, organized by source table. Use this when writing JOINs,
building Drizzle relations, or verifying which tables connect.

### Domain 1 — Org & Identity

| Source Table          | Column                     | References         | Nullable | Notes                             |
| --------------------- | -------------------------- | ------------------ | -------- | --------------------------------- |
| `organizations`       | `feature_flags_updated_by` | `org_members.id`   | YES      | Audit trail                       |
| `org_members`         | `org_id`                   | `organizations.id` | NO       | Tenant FK                         |
| `automation_settings` | `org_id`                   | `organizations.id` | NO       | One-to-one                        |
| `org_email_settings`  | `org_id`                   | `organizations.id` | NO       | One-to-one                        |
| `org_usage`           | `org_id`                   | `organizations.id` | NO       | Usage counters; ON DELETE CASCADE |

### Domain 2 — Contacts

| Source Table        | Column        | References         | Nullable | Notes                     |
| ------------------- | ------------- | ------------------ | -------- | ------------------------- |
| `contacts`          | `org_id`      | `organizations.id` | NO       | Tenant FK                 |
| `contacts`          | `assigned_to` | `org_members.id`   | YES      | Preserved on deactivation |
| `contact_addresses` | `org_id`      | `organizations.id` | NO       | Tenant FK                 |
| `contact_addresses` | `contact_id`  | `contacts.id`      | NO       |                           |
| `contact_notes`     | `org_id`      | `organizations.id` | NO       | Tenant FK                 |
| `contact_notes`     | `contact_id`  | `contacts.id`      | NO       |                           |
| `contact_notes`     | `author_id`   | `org_members.id`   | NO       | Preserved on deactivation |

### Domain 3 — Pipeline

| Source Table      | Column        | References           | Nullable | Notes                     |
| ----------------- | ------------- | -------------------- | -------- | ------------------------- |
| `pipeline_stages` | `org_id`      | `organizations.id`   | NO       | Tenant FK                 |
| `opportunities`   | `org_id`      | `organizations.id`   | NO       | Tenant FK                 |
| `opportunities`   | `contact_id`  | `contacts.id`        | NO       |                           |
| `opportunities`   | `stage_id`    | `pipeline_stages.id` | NO       |                           |
| `opportunities`   | `assigned_to` | `org_members.id`     | YES      | Preserved on deactivation |

### Domain 4 — Jobs

| Source Table | Column           | References         | Nullable | Notes                     |
| ------------ | ---------------- | ------------------ | -------- | ------------------------- |
| `jobs`       | `org_id`         | `organizations.id` | NO       | Tenant FK                 |
| `jobs`       | `opportunity_id` | `opportunities.id` | NO       | UNIQUE — one job per opp  |
| `jobs`       | `contact_id`     | `contacts.id`      | NO       |                           |
| `jobs`       | `assigned_to`    | `org_members.id`   | YES      | Preserved on deactivation |

### Domain 5 — Communication

| Source Table                   | Column            | References         | Nullable | Notes                     |
| ------------------------------ | ----------------- | ------------------ | -------- | ------------------------- |
| `conversations`                | `org_id`          | `organizations.id` | NO       | Tenant FK                 |
| `conversations`                | `contact_id`      | `contacts.id`      | NO       |                           |
| `conversations`                | `assigned_to`     | `org_members.id`   | YES      | Preserved on deactivation |
| `messages`                     | `org_id`          | `organizations.id` | NO       | Tenant FK                 |
| `messages`                     | `conversation_id` | `conversations.id` | NO       |                           |
| `messages`                     | `sent_by`         | `org_members.id`   | YES      | NULL for automation-sent  |
| `inbound_communication_events` | `org_id`          | `organizations.id` | NO       | Tenant FK                 |

### Domain 6 — Revenue: Quotes

| Source Table                | Column                       | References           | Nullable | Notes                                         |
| --------------------------- | ---------------------------- | -------------------- | -------- | --------------------------------------------- |
| `quotes`                    | `org_id`                     | `organizations.id`   | NO       | Tenant FK                                     |
| `quotes`                    | `contact_id`                 | `contacts.id`        | NO       |                                               |
| `quotes`                    | `opportunity_id`             | `opportunities.id`   | YES      | Quotes can exist without opp                  |
| `quotes`                    | `issued_by`                  | `org_members.id`     | YES      |                                               |
| `quotes`                    | `deposit_applied_invoice_id` | `invoices.id`        | YES      | ON DELETE SET NULL; API must enforce same org |
| `quote_line_items`          | `org_id`                     | `organizations.id`   | NO       | Tenant FK                                     |
| `quote_line_items`          | `quote_id`                   | `quotes.id`          | NO       |                                               |
| `quote_views`               | `org_id`                     | `organizations.id`   | NO       | Tenant FK                                     |
| `quote_views`               | `quote_id`                   | `quotes.id`          | NO       |                                               |
| `quote_change_requests`     | `org_id`                     | `organizations.id`   | NO       | Tenant FK                                     |
| `quote_change_requests`     | `quote_id`                   | `quotes.id`          | NO       |                                               |
| `quote_templates`           | `org_id`                     | `organizations.id`   | NO       | Tenant FK                                     |
| `quote_templates`           | `created_by`                 | `org_members.id`     | YES      |                                               |
| `quote_template_line_items` | `org_id`                     | `organizations.id`   | NO       | Tenant FK                                     |
| `quote_template_line_items` | `template_id`                | `quote_templates.id` | NO       |                                               |

### Domain 7 — Revenue: Invoices & Payments

| Source Table         | Column                     | References         | Nullable | Notes                          |
| -------------------- | -------------------------- | ------------------ | -------- | ------------------------------ |
| `invoices`           | `org_id`                   | `organizations.id` | NO       | Tenant FK                      |
| `invoices`           | `contact_id`               | `contacts.id`      | NO       |                                |
| `invoices`           | `job_id`                   | `jobs.id`          | YES      | Invoices can exist without job |
| `invoices`           | `opportunity_id`           | `opportunities.id` | YES      |                                |
| `invoices`           | `quote_id`                 | `quotes.id`        | YES      |                                |
| `invoices`           | `issued_by`                | `org_members.id`   | YES      |                                |
| `invoice_line_items` | `org_id`                   | `organizations.id` | NO       | Tenant FK                      |
| `invoice_line_items` | `invoice_id`               | `invoices.id`      | NO       |                                |
| `payments`           | `org_id`                   | `organizations.id` | NO       | Tenant FK                      |
| `payments`           | `invoice_id`               | `invoices.id`      | NO       |                                |
| `payments`           | `stripe_payment_intent_id` | —                  | YES      | UNIQUE partial index           |
| `payments`           | `recorded_by`              | `org_members.id`   | YES      | NULL for Stripe webhook        |

### Domain 8 — Appointments

| Source Table   | Column        | References         | Nullable | Notes                     |
| -------------- | ------------- | ------------------ | -------- | ------------------------- |
| `appointments` | `org_id`      | `organizations.id` | NO       | Tenant FK                 |
| `appointments` | `contact_id`  | `contacts.id`      | NO       |                           |
| `appointments` | `job_id`      | `jobs.id`          | YES      |                           |
| `appointments` | `assigned_to` | `org_members.id`   | YES      | Preserved on deactivation |

### Domain 9 — Reputation

| Source Table       | Column              | References           | Nullable | Notes                        |
| ------------------ | ------------------- | -------------------- | -------- | ---------------------------- |
| `review_requests`  | `org_id`            | `organizations.id`   | NO       | Tenant FK                    |
| `review_requests`  | `job_id`            | `jobs.id`            | NO       | UNIQUE — one request per job |
| `review_requests`  | `contact_id`        | `contacts.id`        | NO       |                              |
| `review_requests`  | `sent_by_member_id` | `org_members.id`     | YES      | NULL if automation-sent      |
| `reviews`          | `org_id`            | `organizations.id`   | NO       | Tenant FK                    |
| `reviews`          | `job_id`            | `jobs.id`            | NO       |                              |
| `reviews`          | `contact_id`        | `contacts.id`        | NO       |                              |
| `reviews`          | `review_request_id` | `review_requests.id` | YES      |                              |
| `private_feedback` | `org_id`            | `organizations.id`   | NO       | Tenant FK                    |
| `private_feedback` | `job_id`            | `jobs.id`            | NO       |                              |
| `private_feedback` | `contact_id`        | `contacts.id`        | NO       |                              |
| `private_feedback` | `review_request_id` | `review_requests.id` | YES      |                              |
| `private_feedback` | `resolved_by`       | `org_members.id`     | YES      |                              |

### Domain 10 — Files & Media

| Source Table | Column        | References         | Nullable | Notes                          |
| ------------ | ------------- | ------------------ | -------- | ------------------------------ |
| `media`      | `org_id`      | `organizations.id` | NO       | Tenant FK                      |
| `media`      | `uploaded_by` | `org_members.id`   | YES      |                                |
| `media`      | `job_id`      | `jobs.id`          | YES      | CHECK: at least one parent set |
| `media`      | `quote_id`    | `quotes.id`        | YES      | CHECK: at least one parent set |
| `media`      | `invoice_id`  | `invoices.id`      | YES      | CHECK: at least one parent set |
| `media`      | `message_id`  | `messages.id`      | YES      | CHECK: at least one parent set |

### Domain 11 — System

| Source Table            | Column      | References         | Nullable | Notes                        |
| ----------------------- | ----------- | ------------------ | -------- | ---------------------------- |
| `growth_feed_items`     | `org_id`    | `organizations.id` | NO       | Tenant FK                    |
| `internal_activity_log` | `org_id`    | `organizations.id` | NO       | Tenant FK                    |
| `notifications`         | `org_id`    | `organizations.id` | NO       | Tenant FK                    |
| `notifications`         | `member_id` | `org_members.id`   | NO       |                              |
| `automation_jobs`       | `org_id`    | `organizations.id` | NO       | Tenant FK                    |
| `outbox_events`         | `org_id`    | `organizations.id` | YES      | Nullable for platform events |
| `org_counters`          | `org_id`    | `organizations.id` | NO       | PK is the FK                 |

---

## Domain Dependency Chain

Which domains reference which. Read "→" as "has FK into".

```
organizations (root — everything depends on this)
  ├→ org_members (referenced by nearly every domain via assigned_to, author_id, etc.)
  ├→ org_email_settings
  └→ org_usage

contacts → organizations, org_members
contact_addresses → contacts
contact_notes → contacts, org_members

pipeline_stages → organizations
opportunities → contacts, pipeline_stages, org_members

jobs → opportunities, contacts, org_members

conversations → contacts, org_members
messages → conversations, org_members

quotes → contacts, opportunities, org_members, invoices
quote_change_requests → quotes
invoices → contacts, jobs, opportunities, quotes, org_members
payments → invoices, org_members

appointments → contacts, jobs, org_members

review_requests → jobs, contacts, org_members
reviews → jobs, contacts, review_requests
private_feedback → jobs, contacts, review_requests, org_members

media → jobs, quotes, invoices, messages, org_members

notifications → org_members
```

---

## Structural Uniqueness Guards (Idempotency at Schema Level)

These UNIQUE constraints prevent duplicate creation from concurrent operations,
webhook retries, and automation replays:

| Table                   | Constraint                                       | Type                                |
| ----------------------- | ------------------------------------------------ | ----------------------------------- |
| `jobs`                  | `UNIQUE(opportunity_id)`                         | Hard (no WHERE)                     |
| `review_requests`       | `UNIQUE(job_id)`                                 | Hard (no WHERE)                     |
| `contacts`              | `UNIQUE(org_id, phone)`                          | Hard (no WHERE)                     |
| `quotes`                | `UNIQUE(org_id, quote_number)`                   | Hard (no WHERE)                     |
| `quotes`                | `UNIQUE(deposit_stripe_payment_intent_id)`       | Partial (WHERE NOT NULL)            |
| `quote_change_requests` | `UNIQUE(quote_id)`                               | Partial (WHERE resolved_at IS NULL) |
| `invoices`              | `UNIQUE(org_id, invoice_number)`                 | Hard (no WHERE)                     |
| `payments`              | `UNIQUE(stripe_payment_intent_id)`               | Partial (WHERE NOT NULL)            |
| `messages`              | `UNIQUE(twilio_message_sid)`                     | Partial (WHERE NOT NULL)            |
| `outbox_events`         | `UNIQUE(idempotency_key)`                        | Hard (no WHERE)                     |
| `conversations`         | `UNIQUE(org_id, reply_alias)`                    | Partial (WHERE NOT NULL)            |
| `org_email_settings`    | `UNIQUE(org_id)`                                 | Hard (no WHERE)                     |
| `org_email_settings`    | `UNIQUE(reply_domain)`                           | Partial (WHERE NOT NULL)            |
| `org_usage`             | `PRIMARY KEY(org_id, period_start_date, metric)` | Hard (no WHERE)                     |
| `pipeline_stages`       | `UNIQUE(org_id)` WHERE is_won/lost/default       | Partial (one each)                  |
| `org_members`           | `UNIQUE(supabase_user_id)`                       | Hard (no WHERE)                     |
| `org_members`           | `UNIQUE(org_id, email)`                          | Partial (WHERE not deleted)         |

---

## Common Multi-Table Query Patterns

### Contact Detail Page

```
contacts
  LEFT JOIN contact_addresses ON contact_addresses.contact_id = contacts.id
  LEFT JOIN opportunities ON opportunities.contact_id = contacts.id
  LEFT JOIN jobs ON jobs.contact_id = contacts.id
  LEFT JOIN conversations ON conversations.contact_id = contacts.id
  LEFT JOIN quotes ON quotes.contact_id = contacts.id
  LEFT JOIN invoices ON invoices.contact_id = contacts.id
  LEFT JOIN appointments ON appointments.contact_id = contacts.id
  LEFT JOIN review_requests ON review_requests.contact_id = contacts.id
```

All with `WHERE deleted_at IS NULL` on soft-deletable tables.

### Dashboard Revenue Summary

```
invoices (org_id, status IN ('paid', 'partially_paid'))
  JOIN payments ON payments.invoice_id = invoices.id
```

Derive from payments — not invoices.amount_paid.

### Pipeline Board

```
pipeline_stages (org_id, deleted_at IS NULL, ORDER BY position)
  LEFT JOIN opportunities ON opportunities.stage_id = pipeline_stages.id
    AND opportunities.deleted_at IS NULL
  LEFT JOIN contacts ON contacts.id = opportunities.contact_id
```

### Inbox (Conversation List)

```
conversations (org_id, deleted_at IS NULL, ORDER BY last_message_at DESC)
  JOIN contacts ON contacts.id = conversations.contact_id
  LEFT JOIN org_members ON org_members.id = conversations.assigned_to
```

### Job Detail with Related Entities

```
jobs
  JOIN opportunities ON opportunities.id = jobs.opportunity_id
  JOIN contacts ON contacts.id = jobs.contact_id
  LEFT JOIN appointments ON appointments.job_id = jobs.id
  LEFT JOIN invoices ON invoices.job_id = jobs.id
  LEFT JOIN media ON media.job_id = jobs.id
  LEFT JOIN review_requests ON review_requests.job_id = jobs.id
```
