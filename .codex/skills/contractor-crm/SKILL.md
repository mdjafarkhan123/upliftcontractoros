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
| Email              | Brevo                                                |
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
