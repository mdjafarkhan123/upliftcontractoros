
# Contractor Growth Operating System (Multi-Tenant SaaS)

> Last Updated: May 2026 | Status: Approved Foundation Document | Supersedes: Blueprint v2

---

# 1. Product Overview

## Product Type

A multi-tenant contractor business operating system combining:

- CRM
- Communications
- Lead management
- Pipeline management
- Quotes & invoicing
- Automation
- Reputation management
- Growth visibility
- Appointment booking
- Done-for-you agency services

---

## Core Idea

This is NOT traditional CRM software.

The product is:

> A done-for-you business growth system for contractors.

The contractor does NOT configure software.

Instead:

- The platform is set up and maintained by the agency team
- Automations run automatically
- Marketing operations are managed by the agency
- Contractors simply operate their business through a clean command center

---

## Core Promise

> "More jobs. Faster payments. A business system that works while you're on the tools."

---

## Target Users

### Primary Users

Small-to-medium contractors:

- Roofing
- HVAC
- Plumbing
- Electrical
- Remodeling
- Landscaping
- Flooring
- General contractors
- Painting
- Home services

### User Characteristics

Most users are:

- Non-technical
- Mobile-first
- Busy field workers
- Operationally disorganized
- Poor at follow-ups
- Overwhelmed by communication
- Dependent on phone calls and SMS

---

## Product Goal

The system should make contractors feel:

- Organized
- Responsive
- Professional
- Automated
- In control
- Growing

The product should reduce operational chaos.

---

# 2. Product Philosophy

## Done-For-You Philosophy

The platform is NOT self-serve SaaS.

The agency team handles:

- Onboarding
- Setup
- Branding
- Automation configuration
- Google Business Profile management
- Monitoring
- System health
- Marketing operations
- Optimization

The contractor handles:

- Replying to leads
- Sending quotes
- Managing jobs
- Viewing growth
- Collecting payments

---

## UX Philosophy

The app must feel:

- Simple
- Fast
- Calm
- Mobile-first
- Modern
- Confidence-building

Avoid:

- Enterprise complexity
- Technical configuration
- Overwhelming dashboards
- Admin-panel feel

---

## Design Principles

### Clarity Over Complexity

Contractors should understand the app instantly.

### Action-Oriented UX

Every screen should help users respond, close jobs, get paid, and manage communication.

### Mobile-First

Most contractors operate from trucks, job sites, and phones. Mobile UX is critical.

### Automation Visibility

Contractors should FEEL automation but should NOT configure complex workflows.

**GOOD:**

```
✓ Missed Call Text-Back Active
✓ Review Funnel Active
✓ Quote Follow-Up Active
```

**BAD:**

```
Workflow builder graphs
Complex automation editors
```

---

# 3. Product Scope

## Currently In Scope

```
Contractor App
→ Full UI and all modules
→ Full backend and database
→ All contractor-facing features
→ Multi-tenant infrastructure

Super Admin Panel (/jafar)
→ Hidden platform owner route inside the same app
→ Org creation and Admin account provisioning
→ No separate application needed
```

## Out of Scope — Future Build

```
Agency Operations App
→ Not being built now
→ No UI planned yet
→ No separate database
→ Will be built as a separate application later
→ Will share the same database as the Contractor App
```

> **Important note on the Growth Feed:** The Growth Feed is a contractor-facing read module in the current scope. The agency team will write to the Growth Feed by inserting directly into the database until the Agency App is built. The database table is designed now so it is ready when the Agency App is built later.

---

# 4. Multi-Tenant Model

This is a multi-tenant platform. Each contractor business is an isolated organization tenant.

## Organization Rules

- Each contractor business owns exactly one organization
- Contractor users belong to exactly one organization
- Contractor users can NEVER access another organization's data
- All business data is organization-scoped via `org_id`
- Cross-organization visibility is strictly forbidden for contractor users

The platform behaves as a private business vault for every contractor.

## What Each Organization Contains

- Users (team members)
- Contacts
- Conversations
- Opportunities (pre-win sales records)
- Jobs (post-win operational work orders)
- Quotes
- Invoices
- Reviews
- Automation settings
- Branding
- Media
- Notifications
- Pipelines
- Appointments
- Growth feed items

---

# 5. Contractor User Roles

Contractor organizations support three roles.

|Role|Access Level|
|---|---|
|Admin|Full organization access including team management and billing|
|Manager|Operational access — contacts, jobs, quotes, invoices, inbox. No team management or billing|
|Member|Limited access — assigned jobs and conversations only|

> **Important:** Admin accounts are never self-registered. All Admin accounts are created exclusively by the Platform Owner via the Super Admin panel. See Section 7 — Onboarding Flow.

## Permissions Philosophy

Simple RBAC. No enterprise permission complexity. Roles map directly to how contractors actually run their business.

## Future Roles (Not In v1)

- Sales rep
- Technician
- Dispatcher

---

# 6. Billing & Subscription Model

- Billing relationship is between the agency and the contractor
- Each contractor organization connects their own Stripe account
- Contractors collect payments directly into their own Stripe account
- The platform operates on the contractor's behalf using a restricted API key
- Platform subscription fees are managed externally by the agency (unchanged)
- The platform never holds, processes, or intermediates contractor revenue
- Plan tier stored in `organizations.plan`

## Organization Status Flow

```
active → suspended → pending_deletion → deleted
```

|Status|Meaning|Data Behavior|
|---|---|---|
|`active`|Live paying client|Full access|
|`suspended`|Churned or payment failed|App access locked, data retained|
|`pending_deletion`|Scheduled for deletion|Deletion occurs 7 days after scheduling|
|`deleted`|Purged|All org data removed|

Cron job runs nightly to advance orgs through the status flow and execute scheduled deletions.

---

# 7. Onboarding Flow

**Platform Owner controlled. No self-serve. No public registration page exists.**

```
1. Platform Owner visits /jafar (hidden super admin route — known only to Platform Owner)
2. Login form appears — no branding, no hints
3. Platform Owner authenticates with super admin credentials
   → Credentials stored as environment variables only
   → Session is server-side only — completely isolated from Supabase Auth
4. Platform Owner is redirected to Super Admin dashboard
5. Platform Owner fills org creation form:
   → Business name
   → Trade type
   → Location
   → Twilio phone number
6. Platform Owner creates Admin account:
   → Full name
   → Email address (must be a real, accessible inbox)
7. Platform Owner uses Supabase CLI (or Supabase dashboard) to create the
   Admin user directly in Supabase Auth.
8. Platform Owner shares the login email and a temporary password with the
   contractor through a secure channel (phone, encrypted message, etc.).
9. Contractor logs in with the temporary credentials. The application must
   immediately prompt them to change their password. Supabase Auth will handle
   the password update securely.
10. Contractor lands on "Your system is being set up" screen
11. Platform Owner completes full setup: automations, branding, GBP
12. Platform Owner marks org status as active
13. Contractor receives "You're live" notification
14. Contractor begins using the app
```

## What Does Not Exist

```
Public registration page    → Does not exist
Admin self-signup           → Does not exist
Magic link self-onboarding  → Does not exist
```

Implementation detail: The Platform Owner creates the Auth user manually via the
Supabase dashboard or CLI. No automated invite email is sent at creation time.
The contractor's first login forces a password change. If the contractor forgets
their password later, Supabase’s standard password-reset flow (which sends a
reset link to their verified email) will be available.

---

# 8. Core Business Loop

```
Lead arrives
→ Communication starts
→ Appointment booked
→ Quote sent
→ Quote viewed (contractor notified instantly)
→ Opportunity won → Job created automatically
→ Job scheduled and executed
→ Invoice paid
→ Review generated
→ Growth becomes visible
→ Contractor trusts system more
```

The platform optimizes every stage of this loop.

---

# 9. Core Modules

---

## MODULE 1 — Dashboard

### Purpose

Business control center. Provides instant visibility into performance.

### Main Widgets

- Leads this month
- Jobs won
- Revenue collected
- Outstanding invoices
- Quotes awaiting response
- Recent activity feed
- Pipeline snapshot
- Review metrics

### Dashboard Philosophy

The dashboard answers four questions:

1. Am I getting leads?
2. Am I closing jobs?
3. Am I getting paid?
4. What needs my attention right now?

Avoid analytics overload. Every widget leads to an action.

---

## MODULE 2 — All-In-One Inbox

### Purpose

Centralized communication hub.

### Supported Channels

- SMS
- Email
- Website chat
- Missed call events

**Future channels:** WhatsApp, Facebook Messenger, Instagram

### Features

- Unified conversation threads
- Real-time messaging
- Attachments
- Quick replies
- Internal notes
- Conversation tags and statuses
- Message search
- Unread states
- Assignment support

### Conversation Context Sidebar

Shows:

- Pipeline stage
- Latest quote
- Invoice status
- Lead source
- Appointment information
- Last activity
- Assigned team member

### UX Goal

Inbox should feel like iMessage or WhatsApp — NOT like enterprise CRM messaging.

---

## MODULE 3 — Lead Management

### Purpose

Capture and organize all incoming leads.

### Lead Sources

- Website forms
- Live chat
- Missed calls
- Manual entry
- Referrals

### Features

- Automatic contact creation
- Lead source attribution
- Pipeline placement
- Auto-response
- Duplicate detection
- Assignment
- Lead tracking

### Speed-to-Lead

Every lead receives:

- Instant SMS confirmation
- Optional email confirmation
- Contractor notification

---

## MODULE 4A — Pipeline / Opportunity Flow

### Purpose

Visual sales and opportunity management.

### Entity Definition

An Opportunity is a pre-win sales record. It lives in the pipeline from New Lead through to Won or Lost. Once marked Won, an Opportunity automatically generates a Job record. The Opportunity record is retained for sales history and reporting.

> Quotes attach to Opportunities — not to Jobs.

### Default Pipeline Stages

```
New Lead → Contacted → Estimate Scheduled → Quoted → Follow-Up → Won → Lost
```

### Features

- Kanban board
- Drag and drop
- Pipeline revenue totals
- Forecasting
- Filtering
- Assignment
- Lost reason tracking

### UX Goal

Contractors should instantly see where opportunities are stuck, where revenue is sitting, and what requires follow-up.

---

## MODULE 4B — Job Management

### Purpose

Operational work order management. Post-win execution tracking.

### Entity Definition

A Job is a post-win operational record. It is created automatically when an Opportunity is marked Won. It represents the actual work to be scheduled, executed, and invoiced. The Opportunity and Job are linked — one Opportunity generates one Job.

> Invoices attach to Jobs — not to Opportunities.

### Job Lifecycle Stages

```
Scheduled → In Progress → Completed
```

### Job Contains

- Linked opportunity
- Linked contact
- Assigned team member
- Scheduled date and time
- Job notes and instructions
- Linked invoices
- Linked media (job photos, before/after)
- Job status

### Key Rules

- Jobs are never created manually from scratch in v1
- A Job is always born from a Won Opportunity
- Invoices attach to Jobs — not to Opportunities
- Job photos and media attach to Jobs
- When a Job is marked Completed, the review funnel triggers automatically

---

## MODULE 5 — Contact Management

### Purpose

Business relationship memory system.

### Contact Model Rules

**Rule 1 — Unified contacts.** No separate lead and customer tables. One contact record holds the full lifetime history of every relationship.

**Rule 2 — Duplicate detection.** Same phone number = same contact. New activity links to the existing contact. Assigned team member is alerted. No silent merging or silent duplication.

**Rule 3 — Organizational ownership.** Contacts belong to the organization, not to individual users. Assignment is operational (who is working this lead right now), not proprietary.

**Rule 4 — Automatic stage transition.** When an Opportunity is marked Won, the contact is automatically tagged `customer`. Pipeline stage updates accordingly. One record, full history preserved.

### Contact Types (via tags)

- Lead
- Customer
- Referral source
- Homeowner
- Company

### Features

- Full activity timeline
- Notes
- Tags
- Multiple addresses
- Attachments
- Searchable history
- Referral tracking

### Timeline Events

Messages, calls, quotes, invoices, appointments, payments, notes, automation events

---

## MODULE 6 — Quote System

### Purpose

Sales acceleration system.

> Quotes attach to Opportunities — not to Jobs.

### Features

- Quote builder with line items
- PDF generation
- Mobile-friendly client-facing quote pages
- Quote templates
- Auto calculations
- Quote expiry
- Optional deposits
- Attachments
- Request changes flow

### Client Experience

Clients receive an SMS link and email link. No login required. Clients may accept the quote or request changes.

### Quote Viewed Notification

> This is a core product differentiator.

When a client opens a quote, the contractor receives an instant notification:

```
👀 John Smith just viewed your quote for $4,500
```

#### Deduplication Strategy

- Quote link opens a SvelteKit server route first
- Route checks request source
- Excluded: contractor's own session if logged in
- Excluded: repeat requests within 60 seconds from the same IP
- Fires only on the first unique qualifying view
- All views logged to `quote_views` table

```
quote_views
→ id
→ quote_id
→ viewed_at
→ ip_hash
→ user_agent_hash
→ notification_sent       (boolean)
→ notification_sent_at
```

Contractor receives one notification per quote per unique viewer session. View count displayed separately on the quote detail screen.

### Quote Automation

- Automatic follow-up reminders via BullMQ
- Reminder cancellation when quote is accepted or replied to

---

## MODULE 7 — Invoice & Payments

### Purpose

Fast payment collection.

> Invoices attach to Jobs — not to Opportunities.

### Features

- Invoice builder
- Quote to invoice conversion
- Contractor-connected Stripe account (restricted key model)
- Payment links created via contractor's own Stripe account
- Money flows direct: customer → contractor's Stripe - platform is not in the payment chain
- Stripe payment integration
- Payment links
- Partial payments and deposits
- Auto receipts
- Overdue reminders via BullMQ
- Invoice statuses

### Payment UX Goal

Minimal friction. Mobile-first experience. One-tap payment flow.

---

## MODULE 8 — Appointment Booking

### Purpose

Reduce scheduling friction.

### Features

- Booking links
- Availability windows
- Calendar integration
- Confirmation messages
- Reminder sequences
- Rescheduling and cancellation handling

### Automated Reminders

- 24 hours before appointment
- 1 hour before appointment

---

## MODULE 9 — Reputation Management

### Purpose

Generate positive reviews while intercepting negative feedback privately.

### Smart Review Funnel

After job completion, customer receives:

```
How was your experience?
👎 🙁 😐 🙂 🌟
```

**Positive flow:** Redirected to Google review link

**Negative flow:** Redirected to private feedback form → contractor notified internally

### Features

- Review request tracking
- Private feedback management
- Review growth metrics
- Complaint resolution workflow

> **Note:** Review velocity is the number one compounding growth metric for contractors. This module deserves the same engineering attention as the Inbox.

---

## MODULE 10 — Growth Feed

### Purpose

Visible proof of agency work and business growth. Builds contractor trust and long-term retention.

### Contractor View

Clean, chronological feed of significant agency deliverables. Read-only for contractors.

```
Growth Activity — May 2026

✓ Google   — GBP post published: Summer Roof Inspection Special
✓ Website  — Blog article published: 5 Signs Your Roof Needs Repair
✓ Google   — Review response posted
✓ SEO      — Local keyword optimization completed
✓ Facebook — Project spotlight published
```

### Monthly Summary Card

Auto-generated at the top of the feed each month:

```
April Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━
6  GBP posts published
3  Blog articles live
12 Reviews responded to
2  Website updates completed
Rating improved: 4.1 → 4.5 ⭐
```

### Two-Tier Logging Model

|Tier|Visible To|What Goes Here|
|---|---|---|
|Growth Feed|Contractor|Significant deliverables: GBP posts, blog articles, social posts, SEO completions, website updates, review responses, monthly summaries|
|Internal Activity Log|Agency team only|Every micro-task, health checks, monitoring activities, internal notes, competitor checks, system verifications|

> **Philosophy:** The Growth Feed is curated signal, not raw volume. Show contractors meaningful deliverables only. Log everything micro internally for team accountability. Quality of updates builds trust — not quantity.

### Write Mechanism (Current)

Until the Agency App is built, the agency team inserts directly into the `growth_feed_items` table in the database. The table is fully designed now so it is immediately ready when the Agency App is built.

### Write Mechanism (Future — Agency App)

Agency operator selects a client org, fills a simple form, and posts. Item appears on the contractor's Growth tab immediately.

### Growth Feed Data Model

```
growth_feed_items
→ id
→ org_id
→ created_by            (agency operator identifier)
→ category              (gbp_post | seo | social | website | blog | review_response)
→ title
→ body
→ media_url             (optional screenshot or preview)
→ platform_badge        (google | facebook | instagram | website)
→ metrics_snapshot      (JSON — optional KPI at time of post)
→ published_at
→ created_at
```

### Internal Activity Log Data Model

```
internal_activity_log
→ id
→ org_id
→ created_by            (agency operator identifier)
→ activity_type         (health_check | monitoring | note | micro_task | competitor_review)
→ description
→ created_at
```

---

## MODULE 11 — Notification System

### Purpose

Real-time business awareness.

### Notification Types

- New lead
- Quote viewed
- Quote accepted
- Payment received
- Appointment booked
- New review
- Negative feedback received
- Missed call handled

### Notification Philosophy

Notifications must be valuable, actionable, and low-noise. Avoid spam fatigue. Every notification should prompt an action or confirm a win.

---

## MODULE 12 — File & Media System

### Purpose

Operational and marketing asset storage.

### Three-Layer Media Architecture

```
Layer 1 — Upload
User uploads from phone
→ SvelteKit server route
→ Sharp resizes and optimizes server-side
→ Cloudflare R2

Layer 2 — Storage
R2 stores:
→ Original file
→ Web-optimized version (1200px)
→ Thumbnail (300px)

Database stores:
→ Metadata, org_id, job_id, file paths, created_at

Layer 3 — Reuse
Agency team tags contractor media for marketing use:
→ purpose_tag: job_photo | before | after | marketing_asset
Tagged assets become available for GBP posts and social content
```

### Job Media Table

```
job_media
→ id
→ org_id
→ job_id                (nullable — not all media belongs to a job)
→ uploaded_by
→ r2_key
→ thumbnail_key
→ media_type            (photo | pdf | attachment)
→ purpose_tag           (job_photo | before | after | marketing_asset | quote_attachment | invoice_attachment)
→ created_at
```

---

## MODULE 13 — Team Management

### Purpose

Multi-user contractor organizations.

### Roles

|Role|Access|
|---|---|
|Admin|Full organization access|
|Manager|Operational access — no billing or team management|
|Member|Limited — assigned jobs and conversations only|

### Permissions Philosophy

Simple RBAC. Roles map directly to operational responsibilities. No enterprise permission complexity in v1.

---

# 10. Automation Architecture

## Automation Philosophy

Automation should feel invisible but powerful. The system automates repetitive operational work. Contractors feel the results without ever touching configuration.

---

## Split Automation Model

### BullMQ (Redis) — Tenant-Critical Automations

All time-sensitive, contractor-facing automations run through BullMQ job queues. This guarantees reliability, traceability, and per-tenant debugging.

|Automation|Trigger Event|
|---|---|
|Missed call text-back|`call.missed`|
|Speed-to-lead response|`lead.created`|
|Quote follow-up reminders|`quote.sent` + timer|
|Invoice overdue reminders|`invoice.overdue`|
|Review request sequence|`job.completed`|
|Appointment reminders|`appointment.booked` + timer|

> **Rule:** If it affects a contractor directly and is time-sensitive — it lives in BullMQ, not N8N.

### N8N — Agency Marketing Workflows

N8N handles agency-side, non-time-critical, and integration-heavy workflows.

|Workflow|Purpose|
|---|---|
|GBP post publishing|Google Business Profile management|
|Social media publishing|Facebook, Instagram scheduling|
|Agency marketing sequences|Campaigns|
|Scheduled reporting|Monthly performance reports|
|Third-party integrations|External tool connections|
|Review response workflows|Agency-managed review responses|

> **Rule:** N8N is NOT the backend. The application backend is the source of truth. N8N reacts to events emitted by the backend. N8N never owns business logic, authentication, or tenant data.

---

## Core Automation Flows

### Missed Call Text-Back

```
Missed call received (Twilio webhook)
→ backend emits call.missed event
→ BullMQ job created
→ SMS sent to caller within seconds
→ Lead record created
→ Contractor notified
```

### Quote Follow-Up

```
Quote sent
→ BullMQ delayed job scheduled (24h, 72h)
→ Follow-up SMS sent to client
→ Jobs cancelled automatically on acceptance or reply
```

### Invoice Reminder

```
Invoice overdue
→ BullMQ job fires
→ Reminder SMS sent
→ Job reschedules until paid
→ Stops automatically on payment
```

### Review Funnel

```
Job marked Completed
→ BullMQ job created
→ Review request SMS sent to customer
→ Positive response → Google review link
→ Negative response → private feedback form
→ Contractor notified of negative feedback
```

---

# 11. Event-Driven Architecture

## Philosophy

The platform is event-driven. Business actions emit events. Automations and all side effects react asynchronously.

## Core Events

```
lead.created
conversation.created
message.received
quote.sent
quote.viewed
quote.accepted
opportunity.won
job.created
invoice.sent
invoice.paid
job.completed
review.received
appointment.booked
call.missed
```

## Event Usage

Events trigger:

- BullMQ automation jobs
- Real-time notifications
- Analytics updates
- Contact activity timeline entries
- Growth feed updates where applicable

---

# 12. Technical Architecture

---

## Rendering Architecture

**Mode:** SvelteKit CSR — Client-Side Rendering (SPA behavior)

```ts
// src/routes/+layout.ts
export const ssr = false;
```

This single configuration makes every page render client-side globally.

### Why CSR

- The entire app lives behind authentication — SSR provides zero SEO benefit
- Navigation must feel instant — UI shell renders before data arrives
- Contractors use the app on mobile in the field — perceived speed is critical

### Navigation Pattern

```
User taps navigation link
→ Page shell and layout render immediately
→ Skeleton loaders display
→ Data fetches client-side via fetch()
→ Content populates smoothly
```

### Three Non-Negotiable Rendering Rules

```
Rule 1: ssr = false in root +layout.ts
         Applies to every route automatically

Rule 2: All page data loading in +page.ts (client-side only)
         Never use +page.server.ts for UI data loading

Rule 3: Server routes handle all API and backend logic only
         /api/* routes called via fetch() from the client
         Never block navigation
```

### Data Flow Pattern

```
+page.ts (runs client-side)
→ fetch('/api/contacts')
→ SvelteKit /api/contacts server route
→ Drizzle ORM queries Supabase PostgreSQL
→ Returns JSON
→ Page state updates
→ UI populates
```

---

## Super Admin Route — /jafar

The Super Admin panel is a hidden route inside the Contractor App. It is not a separate application.

### How It Works

```
Platform Owner visits: yourapp.com/jafar
→ Minimal login form (no branding, no hints, no public links)
→ Server route checks credentials against environment variables only
→ No Supabase Auth involved — super admin identity is fully decoupled
→ On success: server issues a signed, httpOnly session cookie
→ Platform Owner is redirected to Super Admin dashboard
→ Session is completely isolated from all contractor sessions
```

### Authentication Model

```
SUPER_ADMIN_EMAIL         → environment variable
SUPER_ADMIN_PASSWORD_HASH → environment variable (bcrypt hash)

Server-side check:
→ Compare submitted credentials against env vars
→ Never touches the Supabase users table
→ Never appears in any org-scoped query
→ Session stored server-side — httpOnly cookie, short TTL
```

### Super Admin Capabilities

```
→ Create new organization
→ Create Admin account for that organization
→ Platform Owner sets a temporary password and shares credentials securely
→ View all organizations (read-only list)
→ Update org status (active / suspended)
```

### Routes In Scope

```
/jafar                    → Super Admin login page
/jafar/dashboard          → Org list overview
/jafar/orgs/new           → Create new org + Admin account
/change-password          → Authenticated first-login password change prompt
```

### Security Rules

```
→ Route is not linked anywhere in the app
→ Session cookie is httpOnly and Secure
→ All /jafar/* routes protected by super admin session middleware
→ Failed login attempts are rate-limited
→ TOTP (time‑based one‑time password) is REQUIRED for all /jafar logins.
  The server‑side authentication middleware checks both the password
  and the TOTP code before issuing a session cookie.
→ IP allowlisting is strongly encouraged but not required in v1.
```

> **Rule:** The super admin session and contractor sessions are architecturally separate at all times. The Platform Owner account never appears in any org, never has an org_id, and is never subject to RLS policies.

---

## Frontend Stack

|Layer|Technology|
|---|---|
|Framework|SvelteKit|
|Rendering mode|CSR — ssr = false globally|
|Language|TypeScript|
|Reactivity|Svelte 5 Runes (`$state`, `$derived`, `$effect`, `$props`)|
|Deployment adapter|adapter-node|

### Frontend Priorities

- Mobile-first throughout
- Instant navigation feel
- Skeleton loaders on all data-dependent views
- Thumb-friendly touch targets
- Low cognitive load
- Offline-tolerant behavior
- Realtime-feeling updates via Supabase Realtime

---

## Backend Stack

|Layer|Technology|
|---|---|
|API layer|SvelteKit server routes (`/api/*`)|
|Database|Supabase PostgreSQL|
|ORM|Drizzle ORM|
|Auth|Supabase Auth|
|Realtime|Supabase Realtime|
|Queue|Redis + BullMQ|
|Automation|Self-hosted N8N|

### Backend Responsibilities

- Authentication and session management
- Authorization and RLS enforcement
- Organization isolation
- Business logic
- Event emission
- API endpoints
- Realtime subscriptions
- Automation job scheduling via BullMQ
- Data validation
- Webhook handling and signature verification

---

## Database

**Primary:** PostgreSQL via Supabase

### Database Principles

- Every major entity includes `org_id`
- Soft deletes on all major entities (`deleted_at`)
- Audit timestamps (`created_at`, `updated_at`, `deleted_at`)
- Append-friendly history and timeline aggregation
- Event logs for automation and audit trail
- Relational integrity enforced at schema level

### RLS Strategy

Row Level Security is enforced at the database level on every table.

```
Contractor users:
→ Can only SELECT / INSERT / UPDATE / DELETE
   where org_id = their own org_id
→ Enforced via Supabase RLS policy:
   org_id = auth.jwt().org_id

Backend service role:
→ Used by SvelteKit server routes only
→ Never exposed to the client
→ Used for admin operations and automation jobs

Super Admin (Platform Owner):
→ Uses service role only — via /jafar server routes
→ Never authenticated through Supabase Auth
→ Never subject to RLS policies
→ Direct database access scoped to /jafar server routes only

Agency team (current — no Agency App yet):
→ Direct database access via secure tooling only
→ Never via the Contractor App
```

> **Rule:** RLS policy design happens alongside schema design — never after.

---

## Communication Infrastructure

|Service|Provider|
|---|---|
|SMS and phone|Twilio|
|Email|Resend (Postmark as alternative)|

### Webhook Security — Non-Negotiable

- Twilio: Signature verification middleware on every webhook route
- Stripe: `stripe.webhooks.constructEvent()` on every payment webhook
- Both implemented before first production deployment

---

## Payment Infrastructure

**Provider:** Stripe

Responsibilities:

- Invoice payments
- Deposits
- Payment links

---

## Storage Infrastructure

**Provider:** Cloudflare R2

Do NOT use Supabase Storage for contractor media workloads at scale.

Storage responsibilities:

- Job photos processed through Sharp on upload
- Before and after galleries
- Quote and invoice attachments
- Marketing assets
- All contractor media uploads

Database stores metadata only — paths, ownership, permissions, purpose tags. Files never live in the database.

---

## Deployment Strategy

|Component|Infrastructure|
|---|---|
|Frontend + Backend|SvelteKit on VPS or container platform|
|Database|Supabase PostgreSQL|
|Realtime|Supabase Realtime|
|Queue|Redis on VPS|
|Automation|Self-hosted N8N on VPS|
|Object storage|Cloudflare R2|

### Architecture Philosophy

```
Start as: modular monolith
NOT:       microservices
```

Optimize for speed of iteration during early growth. Future service extraction only when scale demands it.

---

# 13. Data Retention Policy

|Status|Meaning|Data Behavior|
|---|---|---|
|`active`|Live paying client|Full access|
|`suspended`|Churned or payment failed|App locked, data retained|
|`pending_deletion`|Scheduled for deletion|Deletion occurs 7 days after scheduling|
|`deleted`|Purged|All org data permanently removed|

Cron job runs nightly — advances orgs through the status flow and executes scheduled deletions.

---

# 14. Emotional Design Philosophy

## Product Emotional Goals

Contractors should feel:

- Organized
- Responsive
- Professional
- Modern
- Growing
- Automated
- Less stressed

## The Product Should Feel Like

- A business assistant
- An operational command center
- A growth engine

**NOT:**

- Accounting software
- Enterprise ERP
- A complicated CRM

---

# 15. Future Roadmap

## Features

- Voice AI receptionist
- AI quote generation
- Route optimization
- Crew tracking
- Client portal
- WhatsApp support
- Financing integration
- Advanced analytics
- Industry-specific automation templates
- Self-serve onboarding

## Agency Operations App (Separate Future Build)

- Separate UI application
- Shares the same Supabase database as the Contractor App
- Will include: client management, GBP operations, Growth Feed publishing UI, campaign management, internal activity logging UI, onboarding tooling
- Database tables for agency functionality are designed now and ready

---

# 16. Core Product Positioning

**The product is NOT:**

- Generic CRM
- White-labeled GoHighLevel
- Traditional contractor software

**The product IS:**

> A contractor growth operating system combining communication, automation, reputation, visibility, and revenue acceleration into one fully managed platform.

---

# 17. Recommended Next Steps

|Step|Deliverable|Purpose|
|---|---|---|
|✓ 1|Blueprint v3|Done|
|✓ 2|Roles & Access Matrix|Done|
|3|Master Domain Architecture|All entities, relationships, system boundaries|
|4|Core Schema Design|Start with critical tables|
|5|RLS Policy Design|Alongside schema — never after|
|6|API Contract Design|What frontend needs from backend|
|7|Build — Phase 1|Core modules only|

> **Most important principle:** The agency IS the product in v1. The software is the delivery mechanism. Build the Contractor App to a solid standard and serve your first clients well before expanding scope.

---

## Core Entity Relationship Summary

```
Contact
→ has many Opportunities
→ has many Conversations

Opportunity
→ belongs to Contact
→ has one Quote
→ when Won → generates one Job automatically

Job
→ belongs to Opportunity
→ belongs to Contact
→ has many Invoices
→ has many Media (job photos, before/after)
→ when Completed → triggers Review Funnel automatically
```

---

_Blueprint v3 — Approved Foundation Document_ _All issues resolved. Opportunity/Job model confirmed. Ready for Master Domain Architecture._
