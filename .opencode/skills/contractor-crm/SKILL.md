---
name: contractor-crm
description: >
  Business rules, transaction patterns, permission model, and automation architecture
  for the Contractor Growth Operating System — a multi-tenant SaaS CRM built with
  SvelteKit (CSR), Supabase, Drizzle ORM, BullMQ, and Cloudflare R2.

  Use this skill whenever working on ANY part of the contractor CRM codebase: API
  routes, server actions, business logic, permission checks, automation workers,
  database queries, webhook handlers, outbox events, or any feature touching the
  30-table schema. This includes building new modules, fixing bugs, writing tests,
  or reviewing code. Trigger on any work involving contacts, quotes, invoices, jobs,
  pipeline, conversations, appointments, reviews, notifications, media, growth feed,
  /jafar super admin, org management, team member creation, or permission-related
  code. Even if you think you know the answer, consult this skill — the business
  rules contain non-obvious edge cases that Drizzle types cannot express.

  ALSO use this skill for competitor/industry research: it ships a full plain-English
  reference to how Jobber (the market-leading contractor CRM) models every domain
  (references/jobber/jobber-00..07 — clients, requests, quotes, jobs/visits, invoices,
  payments, automations, client hub, and the GraphQL API/webhooks). Load it whenever a
  task asks "how does Jobber do X", or when designing/reworking a feature and you need
  the proven industry pattern to match or beat (Rule 21, industry-first).
---

# Contractor CRM — Business Rules & Architecture

This skill is the business logic authority for the Contractor Growth Operating System.
Drizzle schema files define table shapes. The SvelteKit rules skill defines frontend
patterns. The Bits UI skill defines component patterns. This skill defines everything
else: business rules, state transitions, transaction patterns, permission enforcement,
automation boundaries, and the edge cases that cause bugs when missed.

---

## Reference Routing

Before writing code for a specific domain, read the relevant reference file in
`references/`. Read only what the current task requires — not all.

| You are working on...                                                                                                                                                                   | Read this reference                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Entity CRUD, status transitions, lifecycle rules, any domain<br>logic, financial operations, contact dedup, quote/invoice<br>flows, job creation, pipeline stages, soft delete behavior | `references/business-rules.md`                   |
| Permission checks, auth middleware, RLS policies, JWT claims,<br>role templates, /jafar super admin, team member CRUD,<br>member deactivation, navigation rendering                     | `references/permissions-auth.md`                 |
| Event catalog, event types by domain, typed payload<br>contracts, idempotency key patterns, event naming rules,<br>event versioning strategy                                            | `references/automation-events.md`                |
| Outbox infrastructure, transaction boundary law, outbox\_<br>events schema, worker startup & claim loop, pg_notify,<br>exponential backoff, dead-letter ops, Realtime boundaries        | `references/outbox-worker.md`                    |
| BullMQ queue names, worker idempotency implementation,<br>worker checklist, job cancellation, notification dispatch<br>chain, automation settings, webhook security (Twilio/Stripe)     | `references/bullmq-workers.md`                   |
| End-to-end business flows (missed call, opp won, quote<br>accepted, invoice paid, job completed), concurrency patterns<br>(race conditions), contact activity timeline + pagination     | `references/event-flows.md`                      |
| Schema Principles & Enum Definitions                                                                                                                                                    | `references/00-schema-principles-enums.md`       |
| Organizations, onboarding, feature flags, plans                                                                                                                                         | `references/01-org-identity.md`                  |
| Team members, roles, 40 permission booleans                                                                                                                                             | `references/01-org-identity.md`                  |
| Automation settings, toggle config, message templates                                                                                                                                   | `references/01-org-identity.md`                  |
| Contacts, leads, customers, SMS opt-out, tags                                                                                                                                           | `references/02-contacts.md`                      |
| Contact addresses, contact notes                                                                                                                                                        | `references/02-contacts.md`                      |
| Pipeline stages, opportunities, deals                                                                                                                                                   | `references/03-pipeline.md`                      |
| Jobs, service delivery, scope of work                                                                                                                                                   | `references/04-jobs.md`                          |
| Conversations, inbox, messaging, SMS, Twilio                                                                                                                                            | `references/05-communication.md`                 |
| Quotes, quote line items, quote templates, quote views                                                                                                                                  | `references/06-revenue-quotes.md`                |
| Invoices, invoice line items, payments, Stripe                                                                                                                                          | `references/07-revenue-invoices.md`              |
| Appointments, scheduling, reminders                                                                                                                                                     | `references/08.appoinments.md`                   |
| Review requests, reviews, private feedback                                                                                                                                              | `references/09.reputation.md`                    |
| Media, file uploads, R2 storage                                                                                                                                                         | `references/10-files-and-media.md`               |
| Growth feed, activity log, notifications                                                                                                                                                | `references/11-growth-automations-systems.md`    |
| Automation jobs, outbox events, org counters                                                                                                                                            | `references/11-growth-automations-systems.md`    |
| Any cross-domain query or multi-table join                                                                                                                                              | `references/12-cross-domain-map.md`              |
| Know the project structure if needs                                                                                                                                                     | `references/project-structure.md`                |
| Full project stack used                                                                                                                                                                 | `references/stack.md`                            |
| Contractor list, target contractor                                                                                                                                                      | `references/contractor.md`                       |

If the task spans multiple concerns (e.g. "record a payment" involves business rules
for invoice status transitions AND automation for notification dispatch), read both.

---

## Jobber Competitor Reference (`references/jobber/`)

Before designing or reworking a feature, check how **Jobber** (the market-leading contractor CRM)
models it — so we knowingly **match or beat** the proven pattern (CLAUDE.md Rule 21, industry-first).
These files are a plain-English reference built from Jobber's live GraphQL schema (`JobberJson.md`) +
the Jobber Help Center / Developer Center (every behavior cited; unconfirmed items marked
`(unverified)`). They describe **Jobber**, not our schema — read alongside our own `references/*.md`.

| You want Jobber's model of...                                                             | Read this reference                                     |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Vocabulary, full lead→cash lifecycle, object map, **master status table**, API basics     | `references/jobber/jobber-00-overview-lifecycle.md`     |
| Clients & Properties — customer/location model, tags, custom fields, client hub basics    | `references/jobber/jobber-01-clients-properties.md`     |
| Requests & Leads — work requests, assessments, lead intake / online booking               | `references/jobber/jobber-02-requests-leads.md`         |
| Quotes — line items, good-better-best (option sets), deposits, approvals, financing       | `references/jobber/jobber-03-quotes.md`                 |
| Jobs, Visits & Scheduling — one-off vs recurring, recurrence, billing strategy, calendar  | `references/jobber/jobber-04-jobs-visits-scheduling.md` |
| Invoices & Payments — statuses, batch invoicing, progress invoicing, Jobber Payments/tips | `references/jobber/jobber-05-invoices-payments.md`      |
| Automations & Client Hub — trigger/condition/action builder, self-serve client portal     | `references/jobber/jobber-06-automations-clienthub.md`  |
| **API model** — query/mutation catalog, pagination, `userErrors`, webhooks, rate limits   | `references/jobber/jobber-07-api-mutations.md`          |

Start at `jobber-00` (index + lifecycle + master status table) when unsure which file you need.

---

## Tech Stack Context

| Layer              | Technology                                           |
| ------------------ | ---------------------------------------------------- |
| Framework          | SvelteKit (CSR — `ssr = false` globally)             |
| Language           | TypeScript, Svelte 5 only                            |
| Rendering          | Client-side only; data via `+page.ts` → `fetch()`    |
| API layer          | SvelteKit server routes (`/api/*`)                   |
| Database           | Supabase PostgreSQL                                  |
| ORM                | Drizzle ORM                                          |
| Auth               | Supabase Auth                                        |
| Realtime           | Supabase Realtime (UI delivery only — not event bus) |
| Queue              | Redis + BullMQ                                       |
| SMS/Phone          | Twilio                                               |
| Email              | Resend                                               |
| Payments           | Stripe (contractor-owned accounts, restricted key)   |
| Object storage     | Cloudflare R2                                        |
| Deployment adapter | adapter-node                                         |
| Architecture       | Modular monolith                                     |

### Data Flow Pattern

Every page follows this exact flow — no exceptions:

```
+page.ts (client-side) → fetch('/api/...') → SvelteKit server route
→ Drizzle ORM → Supabase PostgreSQL → JSON response → page state → UI
```

All data loading happens in `+page.ts`. Never use `+page.server.ts` for UI data.
Server routes (`/api/*`) handle all backend logic. Never block navigation.

### Mutation Flow

All `INSERT`, `UPDATE`, `DELETE` operations go through SvelteKit server routes using
the Supabase service role. The service role bypasses RLS. Contractor JWTs have
SELECT-only RLS policies — no mutation policies exist for contractor JWTs.

---

## Universal Rules

These apply to every feature. Violating any is a bug.

### U1 — Tenant Isolation (Rule 1)

`org_id` is on every table. No query ever returns rows from another org. Enforced at
both RLS level and API middleware level. On writes, the server route must scope by
`org_id` from the authenticated session — not from the request body.

### U2 — Soft Deletes (Rule 2)

Default behavior: `WHERE deleted_at IS NULL` on every query unless auditing deletions.

19 tables have `deleted_at`. The following 11 tables intentionally do NOT:

| Table                         | Reason                                                      |
| ----------------------------- | ----------------------------------------------------------- |
| `payments`                    | Financial immutability — never edited/deleted               |
| `quote_views`                 | Append-only view tracking log                               |
| `reviews`                     | Immutable public review record                              |
| `growth_feed_items`           | Permanent agency work log                                   |
| `internal_activity_log`       | Append-only audit log                                       |
| `notifications`               | Purged by cron at 90 days — no soft delete                  |
| `member_notification_prefs`   | Per-member delivery settings                                |
| `push_subscriptions`          | Web Push device tokens                                      |
| `notification_delivery_state` | Internal throttling state (push spam)                       |
| `messages`                    | Immutable communication record                              |
| `automation_jobs`             | Permanent automation audit trail                            |
| `outbox_events`               | Permanent dispatch audit trail                              |
| `activity_events`             | Append-only dashboard feed log — populated by outbox worker |
| `automation_settings`         | One row per org — never independently deleted               |
| `org_counters`                | One row per org — never independently deleted               |

### U3 — Permission Source of Truth (Rule 3)

40 boolean columns on `org_members` are the SOLE authority for access control.
The `role` column (`admin | manager | member`) is for UI template display only —
NEVER used in runtime permission checks. All permission checks must go through a
centralized permission utility. Direct boolean column reads scattered across the
codebase are forbidden.

### U4 — Financial Immutability (Rule 8)

`payments` rows are never edited or deleted after creation. They are the source of
truth for invoice balance reconciliation. `invoices.amount_paid` and
`invoices.amount_due` are denormalized convenience values — never trusted for
financial logic. Always derive from `SUM(payments.amount)`.

### U5 — Transaction Boundary Law (Rule 28)

Every business operation with side effects follows this pattern:

```
INSIDE the database transaction:
  → All business row mutations
  → outbox_events row insertion

OUTSIDE the database transaction (via outbox worker):
  → BullMQ job enqueue
  → Twilio SMS dispatch
  → Resend email dispatch
  → Supabase Realtime publish
  → Any external API call
```

Never enqueue BullMQ, send SMS, or call external services inside a DB transaction.
If the transaction rolls back, external calls cannot be undone.

### U6 — Assignment Preservation (Rule 12)

When a team member is deactivated (`is_active = false`) or soft-deleted, `assigned_to`
references across all tables are NEVER automatically nulled out. Historical assignments
are preserved for audit, attribution, and reporting. The Admin UI surfaces "assigned
to inactive member" warnings and provides bulk reassignment tools.

### U7 — SMS Opt-Out Enforcement (Rule 14)

`contacts.sms_opt_out = true` must block ALL outbound automated SMS for that contact.
Every BullMQ automation worker must check this flag before sending any SMS. This is
a TCPA compliance requirement. When a contact opts out, their open SMS conversation
remains visible but the UI disables the send button and shows an opt-out banner.

Opt-out keywords: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT.
Re-opt-in keywords: START, YES — resets `sms_opt_out` to FALSE, sets `sms_opted_in_at`.

### U8 — Sequential Numbers Are Never Reused (Rule 21)

`quote_number` and `invoice_number` use full unique indexes (`UNIQUE(org_id, number)`)
with no `WHERE` clause. Numbers are permanently consumed even after soft delete.
Generated via `org_counters` with `SELECT ... FOR UPDATE` inside the same transaction
that creates the quote or invoice. Format at display time: `Q-0042`, `INV-0042`.

### U9 — Phone Deduplication (Rule 6)

Phone number is the deduplication key per org: `UNIQUE(org_id, phone)`. Phone must be
normalized to E.164 format (`+15551234567`) at write time BEFORE the dedup check.
Soft-deleted contacts permanently reserve their phone number — no reuse. This is
intentional to prevent silent re-creation of a known contact's record. An Admin can
manually release a reserved number through a dedicated override action.

### U10 — Denormalization Trust Boundaries

These fields are convenience values for query performance. Never trust them for
financial or permission-critical logic:

| Field                        | Source of Truth                                                 |
| ---------------------------- | --------------------------------------------------------------- |
| `invoices.amount_paid`       | `SUM(payments.amount) WHERE invoice_id = ?`                     |
| `invoices.amount_due`        | `invoices.total - SUM(payments.amount)`                         |
| `conversations.unread_count` | `COUNT(messages) WHERE direction='inbound' AND read_at IS NULL` |
| `quote_line_items.total`     | `quantity * unit_price` (recalculate on change)                 |
| `invoice_line_items.total`   | `quantity * unit_price` (recalculate on change)                 |
| `quotes.total`               | `subtotal + tax_amount` (recalculate on line item change)       |

---

## Product Context (Why This Matters for Code Decisions)

This is NOT traditional self-serve SaaS. It is a done-for-you business growth system
for small-to-medium contractors (roofers, HVAC, plumbers, electricians, etc.).

Key implications for code:

- Users are non-technical, mobile-first, busy field workers
- UX must feel like iMessage, not enterprise CRM — keep it simple
- Contractors don't configure workflows; automation runs automatically
- The agency team handles onboarding, setup, and marketing operations
- No public registration page exists — Admin accounts created by Platform Owner via `/jafar`
- CSR everywhere (`ssr = false`) — perceived speed is critical
- Skeleton loaders on all data-dependent views
- Every notification should prompt an action or confirm a win — avoid noise

---

## Common Mistakes to Avoid

1. **Checking `role` column for permissions** — Always use the 40 boolean columns
2. **Trusting `invoices.amount_paid`** — Always derive from `payments` table
3. **Forgetting `deleted_at IS NULL`** — Must be on every query for soft-deletable tables
4. **Creating jobs manually** — Jobs are ONLY created by the Won stage trigger
5. **Auto-advancing opportunity on quote acceptance** — Quote acceptance fires notification only; staff manually moves to Won
6. **Sending SMS inside a DB transaction** — All external calls go through outbox worker
7. **Forgetting SMS opt-out check** — Every automated SMS worker must check `contacts.sms_opt_out`
8. **Nulling `assigned_to` on member deactivation** — Preserve all assignment references
9. **Reusing quote/invoice numbers** — Numbers are permanently consumed
10. **Skipping `FOR UPDATE` on payment recording** — Invoice row must be locked during payment
11. **Writing mutation RLS policies** — All mutations use service role; no contractor JWT mutation policies exist
12. **Using Supabase Realtime as event bus** — It is UI delivery only; outbox_events is the reliability contract
