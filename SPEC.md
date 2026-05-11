# SPEC.md

# Contractor Growth Operating System

Product & Domain Specification  
Status: Active | This document covers WHAT we are building and WHY.  
For HOW to build it (rules, constraints, technical behavior): read `CLAUDE.md`.  
For the step-by-step build order: read `Build_Syllabus_v3.md` in the project root.

---

## Reference Documents

Detailed architecture lives in `/docs/`. Read the relevant one before implementing any domain.

| Document                           | Read When                                             |
| ---------------------------------- | ----------------------------------------------------- |
| `Blueprint v3.md`                  | Product vision, module scope, UX philosophy           |
| `Core Schema Design v1.md`         | All 30 tables — exact column definitions, constraints |
| `Master Domain Architecture v1.md` | Entity rules, relationships, 30 architectural rules   |
| `Event System Architecture v1.md`  | Outbox pattern, event catalog, worker logic           |
| `RLS Policy Matrix v1.md`          | All Row Level Security policies                       |
| `Roles & Access Matrix v2.md`      | 39 permission booleans, role templates, nav rules     |

---

## 1. What This Product Is

A **done-for-you contractor growth operating system** for small-to-medium home service businesses.

This is not generic CRM software. The agency team sets up, configures, and manages the platform on behalf of the contractor. The contractor uses the app to run their business — they never configure workflows or touch settings in normal operation.

The platform handles: lead capture, customer communication, sales pipeline, quoting, job management, invoicing, payments, review generation, and business growth visibility.

The core promise: _more jobs, faster payments, a business system that works while you're on the tools._

---

## 2. Who Uses This

### Contractors (primary users)

Small-to-medium home service businesses: roofing, HVAC, plumbing, electrical, remodeling, landscaping, flooring, painting, general contractors.

Their characteristics matter for every UI decision:

- **Non-technical** — no tolerance for configuration or complexity
- **Mobile-first** — operating from trucks, job sites, and phones
- **Time-poor** — need the app to feel instant, not require thought
- **Phone-centric** — SMS is their primary communication channel

The app must feel like a calm, professional business assistant — not enterprise software.

### Agency team (internal operators)

Manages the platform on behalf of contractors. Sets up automations, manages Google Business Profiles, publishes content, monitors health. Currently operates by inserting directly into the database until the Agency App is built.

### Platform Owner

The single person who built and operates this platform. Creates contractor organizations and Admin accounts via `/jafar`. Has no presence inside the contractor app.

---

## 3. Organization Model

Each contractor business is one **organization** (tenant). Every piece of data belongs to an organization via `org_id`.

Organizations are **never self-created**. The Platform Owner creates them via `/jafar`.

Organization lifecycle:

```
active → suspended → pending_deletion → deleted
```

- `active` — live paying client, full access
- `suspended` — churned or payment failed, app locked, data retained
- `pending_deletion` — 90 days post-suspension, deletion scheduled
- `deleted` — all data permanently removed by cron

A newly created organization starts with `is_setup_complete = false` (provisioning).
During this phase, the contractor sees a "Your system is being set up" screen,
not the operational dashboard. The Platform Owner completes onboarding and
sets `is_setup_complete = true` to unlock the full app.

---

## 4. User Roles

Three roles exist within a contractor organization.

| Role    | Who                           | Created By                |
| ------- | ----------------------------- | ------------------------- |
| Admin   | The contractor — org owner    | Platform Owner via /jafar |
| Manager | Office staff, operations lead | Admin                     |
| Member  | Field worker, technician      | Admin                     |

**Admin** always has full access to everything. No restrictions.

**Manager** has full operational access. Cannot manage team accounts or billing.

**Member** has limited access — assigned jobs and conversations only by default.

Permissions are 39 explicit boolean columns on `org_members`. There is no permission hierarchy or inheritance — each boolean is independently toggled. See `Roles & Access Matrix v2.md` for the full matrix.

---

## 5. Core Domain Modules

### Contacts

The unified relationship record for every person the org interacts with. One record from first lead touch to repeat customer — no separate lead and customer tables. Status (`lead → customer → archived`) tracks the lifecycle. Phone number is the deduplication key.

Contacts belong to the organization, not to individual team members. Assignment (`assigned_to`) is operational — who is working this contact right now.

### Inbox

The all-in-one communication hub. SMS, email, website chat, and missed call events unified into one conversation thread per contact per channel. Feels like iMessage — not enterprise messaging. Inbound Twilio webhooks create conversations and messages automatically.

TCPA compliance is built in: STOP/UNSUBSCRIBE keywords set `sms_opt_out = true` and block all further automated SMS. START/YES resets opt-out.

### Pipeline

Visual sales and opportunity management. An **Opportunity** is the pre-win record — a potential job moving through configurable stages from New Lead to Won or Lost.

When an opportunity is moved to the Won stage, a Job is automatically created. This is the most critical transition in the system — it triggers contact status update, job creation, and multiple business events atomically.

Default stages: New Lead → Contacted → Estimate Scheduled → Quoted → Follow-Up → Won → Lost.

### Jobs

The operational work order. A **Job** is always created from a Won opportunity — never manually. It represents the actual work to be scheduled, executed, and invoiced.

Job lifecycle: `scheduled → in_progress → completed → cancelled`.

When a job is marked `completed`, the review funnel triggers automatically.

Service address is snapshot-copied from the contact's address at job creation and never changes — preserving historical accuracy.

### Quotes

A priced proposal sent to a contact. Quotes attach to Opportunities — not to Jobs.

Quote lifecycle: `draft → sent → viewed → accepted → declined → expired`.

Quote acceptance does **not** automatically create a job. Staff manually advances the opportunity to Won when operationally ready (deposit cleared, materials confirmed, scheduling confirmed). This decoupling is intentional.

The **quote viewed notification** is a core product differentiator: when a client opens the quote link, the contractor receives an instant in-app notification. Deduplication prevents repeat notifications.

Clients access quotes via a public tokenized link — no login required.

### Invoices

A payment request issued to a contact. Invoices attach to Jobs — not to Opportunities.

Invoice lifecycle: `draft → sent → partially_paid → paid → overdue → cancelled`.

Each contractor connects their own Stripe account. Payment flows directly from customer to contractor — the platform is not in the payment chain.

The `payments` table is the authoritative source of truth for financial state. Invoice balance fields are denormalized convenience values.

### Appointments

Scheduled visits, estimates, or meetings. Can exist before a job (estimate appointments) or linked to a job. Automatic 24h and 1h SMS reminders fire via BullMQ. Reminders reset when an appointment is rescheduled.

### Reputation Management

The smart review funnel runs automatically after every completed job.

Customer receives SMS: "How was your experience? Reply 1–5."

- Score ≥ 4 → directed to Google review link (positive outcome)
- Score ≤ 3 → private feedback captured internally, contractor notified (negative intercepted before it becomes public)

Review velocity is the number one compounding growth metric for contractors. This module is as important as the Inbox.

### Growth Feed

A contractor-visible read-only feed of significant agency deliverables: GBP posts, blog articles, social posts, SEO completions, website updates, monthly summaries.

Philosophy: curated signal, not raw volume. Show contractors meaningful proof that the agency is working. Quality of updates builds long-term retention.

Agency team currently writes to this table directly in the database (Agency App is post-v1).

### Notifications

In-app notification system. Delivered via Supabase Realtime. Types include: new lead, quote viewed, quote accepted, payment received, appointment booked, new review, negative feedback, missed call handled.

Every notification is actionable — clicking navigates to the relevant entity.

Notifications purge after 90 days regardless of read status.

---

## 6. The Golden Path

Every architecture decision should support this flow:

```
Lead arrives (web form, missed call, manual entry)
→ Contact created automatically
→ Conversation opened in Inbox
→ Opportunity placed in pipeline
→ Speed-to-lead SMS sent automatically
→ Appointment scheduled
→ Quote built and sent
→ Client opens quote → contractor notified instantly
→ Client accepts quote
→ Contractor marks Opportunity Won
→ Job created automatically
→ Job scheduled and executed
→ Invoice sent
→ Client pays via Stripe link
→ Payment received → contractor notified
→ Job marked complete
→ Review request SMS sent automatically
→ Customer replies 5 → directed to Google review
→ Growth Feed updated with agency work
→ Contractor sees business growing
```

---

## 7. Key Entity Relationships

```
Contact
  → many Opportunities
  → many Conversations
  → many Quotes (directly)
  → many Appointments

Opportunity
  → belongs to Contact
  → has one Quote (typically)
  → when Won → creates one Job (UNIQUE constraint)

Job
  → belongs to Opportunity
  → belongs to Contact (denormalized at creation)
  → has many Invoices
  → has many Appointments
  → has many Media
  → has one Review Request (UNIQUE constraint)

Invoice
  → belongs to Job (nullable)
  → has many Payments
  → Payments table is authoritative for financial state
```

---

## 8. Automation Architecture

Two automation systems with distinct responsibilities.

**BullMQ (Redis)** — all time-sensitive contractor-facing automations:

| Trigger               | Automation                        |
| --------------------- | --------------------------------- |
| `call.missed`         | Missed call text-back SMS         |
| `contact.created`     | Speed-to-lead SMS                 |
| `quote.sent`          | Follow-up SMS at 24h and 72h      |
| `invoice.overdue`     | Overdue reminder SMS              |
| `job.completed`       | Review request SMS (delayed)      |
| `appointment.created` | Reminder SMS at 24h and 1h before |

**N8N** — agency-side, non-time-critical workflows (GBP posting, social publishing, reporting). N8N is not the backend. It reacts to events emitted by the backend. It never owns business logic or tenant data.

---

## 9. V1 Scope Boundaries

**In scope:**

- Full contractor app with all modules above
- `/jafar` super admin panel (hidden route inside the same app)
- Multi-tenant infrastructure

---

## 10. What the Contractor Should Feel

The product is not software. It is a business assistant.

The contractor should feel: **organized, responsive, professional, automated, in control, growing.**

The app should feel like: a calm command center, not an enterprise dashboard.

Every screen answers one of four questions:

1. Am I getting leads?
2. Am I closing jobs?
3. Am I getting paid?
4. What needs my attention right now?
