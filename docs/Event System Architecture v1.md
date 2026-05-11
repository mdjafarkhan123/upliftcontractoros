# Event System Architecture v1

# Contractor Growth Operating System

> Last Updated: May 2026 | Status: Approved | Depends On: Domain Architecture v1 | Supersedes: None

---

# 0. Purpose

This document defines the complete event-driven architecture of the platform. Every asynchronous operation, automation trigger, notification, and side effect in the system flows through the patterns defined here.

Before implementation begins, every developer must internalize three foundational truths:

```
1. Business state changes and their side effects must be atomically consistent.
   The outbox pattern is the only acceptable mechanism for this.

2. Supabase Realtime is a UI delivery layer. It is not an event bus.
   Business-critical automation never depends on Realtime.

3. All async consumers are idempotent by design.
   At-least-once delivery is guaranteed. Exactly-once is the consumer's responsibility.
```

---

# 1. Three-Layer Architecture — Event Flow

```
┌────────────────────────────────────────────────────────────┐
│  LAYER 1 — TRANSACTIONAL CORE                              │
│  PostgreSQL + Drizzle                                      │
│                                                            │
│  API route handles request                                 │
│  → BEGIN transaction                                       │
│  → mutate business rows                                    │
│  → INSERT outbox_events row                                │
│  → COMMIT                                                  │
└────────────────────────────────────────────────────────────┘
            │ pg_notify fires on INSERT
            │ (fallback: 30s polling)
            ▼
┌────────────────────────────────────────────────────────────┐
│  LAYER 2 — RELIABLE ASYNC INFRASTRUCTURE                   │
│  Outbox Worker + BullMQ + Redis                            │
│                                                            │
│  Worker claims pending rows via FOR UPDATE SKIP LOCKED     │
│  → validates idempotency_key                               │
│  → routes event_type to correct BullMQ queue               │
│  → BullMQ worker executes side effect                      │
│  → marks outbox_events.status = processed                  │
│  → inserts automation_jobs audit row                       │
│  → inserts notifications row (if user-facing)              │
└────────────────────────────────────────────────────────────┘
            │ notifications row INSERT triggers Realtime
            ▼
┌────────────────────────────────────────────────────────────┐
│  LAYER 3 — REACTIVE UX LAYER                               │
│  Supabase Realtime                                         │
│                                                            │
│  Client subscribes to notifications WHERE member_id = me  │
│  → new row appears → notification bell updates             │
│  → inbox subscribes to messages → new message appears      │
│  → dashboard subscribes to jobs → counts update            │
└────────────────────────────────────────────────────────────┘
```

---

# 2. Transaction Boundary Law

This is the single most important operational rule in the system.

## What Goes INSIDE the Database Transaction

```
BEGIN

  -- 1. All business row mutations
  UPDATE opportunities SET stage_id = won_stage_id, closed_at = now()
  INSERT INTO jobs (opportunity_id, contact_id, ...)
  UPDATE contacts SET status = 'customer'

  -- 2. outbox_events row — always last
  INSERT INTO outbox_events (
    event_type, resource_type, resource_id,
    payload, idempotency_key, ...
  )

COMMIT
```

## What NEVER Goes Inside a Transaction

```
❌ await bullmq.add(...)           — enqueue job
❌ await twilio.messages.create()  — send SMS
❌ await resend.emails.send()      — send email
❌ supabase.channel().send()       — Realtime publish
❌ fetch('https://...')            — any external HTTP call
```

**Why:** If the transaction rolls back, external calls cannot be undone. A sent SMS cannot be unsent. A BullMQ job cannot be un-enqueued. These must only happen after commit, via the outbox worker.

## The Correct Mental Model

```
DB transaction = "declare intent"
Outbox worker  = "execute intent"
```

**Note**: Critical mutation requests must be safely deduplicated to prevent accidental duplicate actions.

---

# 3. The `outbox_events` Table

Full schema reference. Defined in Domain Architecture v1.

```
id                  UUID, primary key
org_id              UUID (nullable — null for platform-level events)
event_type          text
event_version       integer, default 1
resource_type       text
resource_id         UUID
payload             JSONB
status              pending | processing | processed | failed | dead_lettered
attempts            integer, default 0
max_attempts        integer, default 3
sequence            integer — auto-increment, ensures ordering within a transaction
available_at        timestamp, default now()
processed_at        timestamp nullable
dead_lettered_at    timestamp nullable
last_error          text nullable
idempotency_key     text UNIQUE
created_at
updated_at
```

---

# 4. Idempotency Key Strategy

Idempotency keys define replay behavior. Wrong keys mean wrong replay semantics.

## Rule

```
Uniqueness semantics define replay behavior.
```

## Domain Events — Resource-Scoped Keys

These events fire exactly once per lifecycle transition on a given resource.

```
Pattern:  {event_type}:{resource_id}

Examples:
  job.completed:job-uuid-abc
  quote.accepted:quote-uuid-def
  invoice.paid:invoice-uuid-ghi
  opportunity.won:opp-uuid-jkl
  contact.created:contact-uuid-mno
```

If the same event fires twice (webhook retry, race condition), the `UNIQUE` constraint on `idempotency_key` causes the second insert to fail gracefully. The business operation already completed. No duplicate side effects.

## Scheduled Automation Events — Execution-Scoped Keys

These events may fire multiple times on the same resource over its lifetime.

```
Pattern:  {event_type}:{automation_job_id}

Examples:
  quote.followup:automation-job-uuid-001
  invoice.reminder:automation-job-uuid-002
  appointment.reminder:automation-job-uuid-003
```

`automation_job_id` is the idempotency anchor — each scheduled execution is a distinct event instance. The same quote can receive multiple follow-up events. The same invoice can receive multiple reminders. Each is independently idempotent.

## Platform Events — Operation-Scoped Keys

```
Pattern:  {event_type}:{date_bucket}:{optional_scope}

Examples:
  monthly_summary.generate:2026-05-01
  org.deletion_sweep:2026-05-08
  notification.retention_cleanup:2026-05-08
```

---

# 5. Complete Event Catalog

Every event that exists in this system. Organized by domain.

---

## Domain: Contact

| Event Type                   | Trigger                                    | Resource |
| ---------------------------- | ------------------------------------------ | -------- |
| `contact.created`            | New contact created (inbound lead, manual) | contact  |
| `contact.duplicate_detected` | Inbound lead matches existing phone        | contact  |
| `contact.status_changed`     | Status transitions (lead → customer)       | contact  |

---

## Domain: Pipeline

| Event Type                  | Trigger                                               | Resource    |
| --------------------------- | ----------------------------------------------------- | ----------- |
| `opportunity.created`       | New opportunity added to pipeline                     | opportunity |
| `opportunity.stage_changed` | Opportunity moved between stages                      | opportunity |
| `opportunity.won`           | Opportunity reaches Won stage — triggers job creation | opportunity |
| `opportunity.lost`          | Opportunity reaches Lost stage                        | opportunity |

---

## Domain: Jobs

| Event Type           | Trigger                                      | Resource |
| -------------------- | -------------------------------------------- | -------- |
| `job.created`        | Job created from Won opportunity             | job      |
| `job.assigned`       | Job assigned to a team member                | job      |
| `job.status_changed` | Job status transitions                       | job      |
| `job.completed`      | Job marked complete — triggers review funnel | job      |
| `job.cancelled`      | Job cancelled                                | job      |

---

## Domain: Communication

| Event Type             | Trigger                         | Resource     |
| ---------------------- | ------------------------------- | ------------ |
| `conversation.created` | New conversation opened         | conversation |
| `message.received`     | Inbound message from contact    | message      |
| `message.sent`         | Outbound message to contact     | message      |
| `call.missed`          | Missed call received via Twilio | conversation |

---

## Domain: Revenue

| Event Type         | Trigger                                    | Resource |
| ------------------ | ------------------------------------------ | -------- |
| `quote.created`    | New quote drafted                          | quote    |
| `quote.sent`       | Quote sent to contact                      | quote    |
| `quote.viewed`     | Contact opens quote link (qualifying view) | quote    |
| `quote.accepted`   | Contact accepts quote                      | quote    |
| `quote.declined`   | Contact declines quote                     | quote    |
| `quote.expired`    | Quote passes expiry date unpresponded      | quote    |
| `invoice.created`  | New invoice created                        | invoice  |
| `invoice.sent`     | Invoice sent to contact                    | invoice  |
| `invoice.paid`     | Invoice fully paid                         | invoice  |
| `invoice.overdue`  | Invoice passes due date unpaid             | invoice  |
| `payment.recorded` | Payment recorded against invoice           | payment  |

---

## Domain: Appointments

| Event Type                | Trigger                     | Resource    |
| ------------------------- | --------------------------- | ----------- |
| `appointment.created`     | Appointment scheduled       | appointment |
| `appointment.rescheduled` | Appointment time changed    | appointment |
| `appointment.completed`   | Appointment marked complete | appointment |
| `appointment.cancelled`   | Appointment cancelled       | appointment |
| `appointment.no_show`     | Contact did not attend      | appointment |

---

## Domain: Reputation

| Event Type                  | Trigger                       | Resource         |
| --------------------------- | ----------------------------- | ---------------- |
| `review_request.sent`       | Review request SMS dispatched | review_request   |
| `review.received`           | Positive review captured      | review           |
| `private_feedback.received` | Negative feedback submitted   | private_feedback |

---

## Domain: Automation (Scheduled)

| Event Type                            | Trigger                             | Resource     |
| ------------------------------------- | ----------------------------------- | ------------ |
| `automation.missed_call_textback`     | BullMQ: call.missed + delay         | conversation |
| `automation.speed_to_lead`            | BullMQ: contact.created + delay     | contact      |
| `automation.quote_followup`           | BullMQ: quote.sent + 24h/72h delay  | quote        |
| `automation.invoice_reminder`         | BullMQ: invoice.overdue + delay     | invoice      |
| `automation.review_request`           | BullMQ: job.completed + delay       | job          |
| `automation.appointment_reminder_24h` | BullMQ: appointment.created + delay | appointment  |
| `automation.appointment_reminder_1h`  | BullMQ: appointment.created + delay | appointment  |

---

## Domain: Platform (System-Level, org_id = null)

| Event Type                      | Trigger                 | Resource |
| ------------------------------- | ----------------------- | -------- |
| `platform.monthly_summary`      | First day of month cron | null     |
| `platform.org_deletion_sweep`   | Nightly cron            | null     |
| `platform.notification_cleanup` | Nightly cron            | null     |

---

# 6. Event Payload Contracts

Every event carries a typed payload in `outbox_events.payload JSONB`. Schemas below define the minimum required fields. Additional context fields are permitted.

---

## `job.completed`

```json
{
	"job_id": "uuid",
	"org_id": "uuid",
	"contact_id": "uuid",
	"opportunity_id": "uuid",
	"assigned_to": "uuid | null",
	"completed_at": "ISO8601 timestamp"
}
```

---

## `opportunity.won`

```json
{
	"opportunity_id": "uuid",
	"org_id": "uuid",
	"contact_id": "uuid",
	"stage_id": "uuid",
	"won_at": "ISO8601 timestamp"
}
```

---

## `quote.accepted`

```json
{
	"quote_id": "uuid",
	"org_id": "uuid",
	"contact_id": "uuid",
	"opportunity_id": "uuid | null",
	"total": "decimal string",
	"accepted_at": "ISO8601 timestamp"
}
```

---

## `quote.viewed`

```json
{
	"quote_id": "uuid",
	"org_id": "uuid",
	"contact_id": "uuid",
	"viewed_at": "ISO8601 timestamp",
	"ip_hash": "string",
	"notification_sent": false
}
```

---

## `invoice.paid`

```json
{
	"invoice_id": "uuid",
	"org_id": "uuid",
	"contact_id": "uuid",
	"job_id": "uuid | null",
	"total": "decimal string",
	"amount_paid": "decimal string",
	"paid_at": "ISO8601 timestamp"
}
```

---

## `invoice.overdue`

```json
{
	"invoice_id": "uuid",
	"org_id": "uuid",
	"contact_id": "uuid",
	"total": "decimal string",
	"amount_due": "decimal string",
	"due_date": "ISO8601 date",
	"days_overdue": "integer"
}
```

---

## `call.missed`

```json
{
	"org_id": "uuid",
	"twilio_phone_number": "string E.164",
	"caller_phone": "string E.164",
	"contact_id": "uuid | null",
	"call_sid": "string",
	"missed_at": "ISO8601 timestamp"
}
```

---

## `contact.created`

```json
{
	"contact_id": "uuid",
	"org_id": "uuid",
	"phone": "string E.164",
	"lead_source": "string",
	"created_at": "ISO8601 timestamp"
}
```

---

## `appointment.rescheduled`

```json
{
	"appointment_id": "uuid",
	"org_id": "uuid",
	"contact_id": "uuid",
	"job_id": "uuid | null",
	"assigned_to": "uuid | null",
	"old_start_at": "ISO8601 timestamp",
	"new_start_at": "ISO8601 timestamp",
	"reminder_flags_reset": true
}
```

---

## `automation.quote_followup`

```json
{
	"automation_job_id": "uuid",
	"quote_id": "uuid",
	"org_id": "uuid",
	"contact_id": "uuid",
	"followup_number": 1,
	"scheduled_for": "ISO8601 timestamp"
}
```

---

## `automation.review_request`

```json
{
	"automation_job_id": "uuid",
	"job_id": "uuid",
	"org_id": "uuid",
	"contact_id": "uuid",
	"delay_hours": 2,
	"scheduled_for": "ISO8601 timestamp"
}
```

---

# 7. Outbox Worker Architecture

## Worker Startup

```
1. Connect to PostgreSQL
2. LISTEN outbox_channel          ← wake up on pg_notify
3. Start 30-second fallback poll  ← catch any missed notifies
4. Begin claim loop
```

## Claim Loop

```sql
BEGIN;

SELECT id, event_type, payload, idempotency_key, attempts, max_attempts
FROM outbox_events
WHERE status = 'pending'
  AND available_at <= NOW()
ORDER BY sequence ASC
LIMIT 10
FOR UPDATE SKIP LOCKED;

UPDATE outbox_events
SET status = 'processing',
    attempts = attempts + 1,
    updated_at = NOW()
WHERE id = ANY(claimed_ids);

COMMIT;
```

`FOR UPDATE SKIP LOCKED` is non-negotiable. It ensures multiple worker instances never claim the same row simultaneously.

## Dispatch

```
For each claimed row:

  1. Route to correct BullMQ queue by event_type
  2. Add idempotency_key to BullMQ job options
  3. Enqueue job with payload

  On success:
    UPDATE outbox_events SET status = 'processed', processed_at = NOW()

  On failure:
    IF attempts < max_attempts:
      UPDATE outbox_events SET status = 'pending',
        available_at = NOW() + exponential_backoff(attempts),
        last_error = error_message
    ELSE:
      UPDATE outbox_events SET status = 'dead_lettered',
        dead_lettered_at = NOW(),
        last_error = error_message
```

## Exponential Backoff Schedule

```
Attempt 1 failure → retry in 30 seconds
Attempt 2 failure → retry in 5 minutes
Attempt 3 failure → dead_lettered
```

## pg_notify Trigger

```sql
CREATE OR REPLACE FUNCTION notify_outbox_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('outbox_channel', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outbox_notify
AFTER INSERT ON outbox_events
FOR EACH ROW
EXECUTE FUNCTION notify_outbox_insert();
```

---

# 8. BullMQ Queue Architecture

## Queue Names

```
queue:missed-call-textback
queue:speed-to-lead
queue:quote-followup
queue:invoice-reminder
queue:review-request
queue:appointment-reminder
queue:notification-dispatch
```

## Worker Idempotency

Every BullMQ worker must check for prior execution before proceeding:

```typescript
// Example: review_request worker
async function processReviewRequest(job: Job) {
	const { automation_job_id, job_id, org_id } = job.data;

	// Idempotency check — has this already been processed?
	const existing = await db.query.review_requests.findFirst({
		where: eq(review_requests.job_id, job_id)
	});

	if (existing) {
		// Already created — safe to return, no duplicate
		return { skipped: true, reason: 'review_request already exists' };
	}

	// Check SMS opt-out before sending
	const contact = await getContact(org_id, job_id);
	if (contact.sms_opt_out) {
		return { skipped: true, reason: 'sms_opt_out' };
	}

	// Check automation settings
	const settings = await getAutomationSettings(org_id);
	if (!settings.review_funnel_enabled) {
		return { skipped: true, reason: 'review_funnel_disabled' };
	}

	// Execute the side effect
	await createReviewRequest(org_id, job_id, contact.id);
	await sendReviewRequestSMS(contact.phone, org_id);

	// Record in automation_jobs audit trail
	await recordAutomationJob(automation_job_id, 'completed');
}
```

## Worker Checklist — Every Worker Must

```
□ Check idempotency before executing
□ Check sms_opt_out before sending SMS
□ Check automation_settings before triggering automation
□ Record result in automation_jobs
□ Insert notifications row when user-facing
□ Handle partial failure gracefully (don't re-send if SMS sent but DB write failed)
□ Render all human-readable times in `organizations.timezone`, not UTC
```

---

## Job Cancellation Pattern

When a business event makes a pending automation unnecessary
(e.g., quote accepted → cancel follow-up reminders):

1. Find all `automation_jobs` rows matching:
   - `resource_type` = the triggering entity type
   - `resource_id` = the entity ID
   - `type` = the automation to cancel
   - `status` = 'pending'

2. For each matching row:
   - Call `bullmqQueue.remove(automation_jobs.bull_job_id)`
   - Update `automation_jobs.status` = 'cancelled'

3. As a safety net, every BullMQ worker must check
   `automation_jobs.status` at execution start — if the status
   is already 'cancelled', the worker must exit immediately.

# 9. Notification Dispatch Chain

How a business event becomes a visible in-app notification:

```
1. API route commits transaction
   → business rows updated
   → outbox_events row inserted
   → COMMIT

2. pg_notify fires → outbox worker wakes

3. Outbox worker claims row
   → dispatches to queue:notification-dispatch

4. BullMQ notification worker processes
   → determines which org_member(s) receive this notification
   → INSERT INTO notifications (member_id, type, resource_type, resource_id, ...)

5. Supabase Realtime detects notifications INSERT
   → pushes to subscribed client

6. Client UI updates
   → notification bell badge increments
   → notification panel shows new item
```

**Critical:** Steps 1–4 are guaranteed by the outbox pattern. Step 5–6 are best-effort Realtime delivery. If the client is offline, they see the notification on next app open by querying the `notifications` table directly.

---

# 10. Concurrency Rules

## Contact Deduplication Race

**Scenario:** Two inbound leads arrive simultaneously with the same normalized phone number.

**Solution:**

```sql
INSERT INTO contacts (org_id, phone, ...)
ON CONFLICT (org_id, phone)
DO NOTHING
RETURNING id;
```

If `RETURNING id` is null, the contact already exists. Fetch it by `(org_id, phone)` and link the inbound event to it. Emit `contact.duplicate_detected` event.

---

## Job Creation Race

**Scenario:** Two requests simultaneously move the same opportunity to Won stage.

**Solution:** `UNIQUE(opportunity_id)` on `jobs` makes one insert succeed and one fail. The failing transaction rolls back cleanly. No duplicate job. No orphaned outbox event.

---

## Sequential Number Race

**Scenario:** Two users simultaneously create quotes in the same org.

**Solution:** `SELECT ... FOR UPDATE` on `org_counters` serializes number generation:

```sql
BEGIN;
  SELECT next_quote_number FROM org_counters WHERE org_id = ? FOR UPDATE;
  UPDATE org_counters SET next_quote_number = next_quote_number + 1 WHERE org_id = ?;
  -- assign new counter value to quote
COMMIT;
```

Only one transaction holds the lock at a time. The other waits. Both get unique numbers.

---

## Payment Webhook Race

**Scenario:** Stripe fires `payment_intent.succeeded` twice.

**Solution:** `UNIQUE(stripe_payment_intent_id)` on `payments`. Second insert fails with a unique constraint violation. Handler catches this specific error and returns 200 OK to Stripe (webhook acknowledged, no duplicate payment).

---

## Review Request Race

**Scenario:** BullMQ retries a `review_request` worker — review request already exists.

**Solution:** `UNIQUE(job_id)` on `review_requests`. Worker checks for existing row before inserting. If it exists, worker exits cleanly. Same result, no duplicate SMS.

---

# 11. Event Versioning Strategy

All outbox events carry `event_version integer default 1`.

## Versioning Rules

```
Version 1 is the initial payload schema.

When a payload schema changes:
  - bump event_version to 2
  - consumers must handle BOTH version 1 and version 2
  - never remove fields from version 1 during a rolling deploy
  - old events in the outbox still carry version 1 — they must still be processable

Version upgrade procedure:
  1. Deploy new consumer that handles v1 and v2
  2. Deploy new producer that emits v2
  3. After all v1 events are processed, clean up v1 handling
```

## Example

```json
// Version 1
{
  "event_version": 1,
  "job_id": "uuid",
  "contact_id": "uuid"
}

// Version 2 — adds assigned_to
{
  "event_version": 2,
  "job_id": "uuid",
  "contact_id": "uuid",
  "assigned_to": "uuid | null"
}
```

Consumer:

```typescript
if (payload.event_version === 1) {
	// handle without assigned_to
} else if (payload.event_version >= 2) {
	// handle with assigned_to
}
```

---

# 12. Dead-Letter Operations

When `outbox_events.status = 'dead_lettered'`:

## Platform Owner Actions (via `/jafar`)

```
View dead-lettered events per org:
  → event_type
  → resource_type + resource_id
  → last_error
  → attempts
  → dead_lettered_at
  → payload (redacted for sensitive data)

Actions available:
  → Manual retry (resets status to 'pending', clears dead_lettered_at)
  → Dismiss (acknowledges without retry — records dismissal)
  → Investigate (links to automation_jobs audit trail)
```

## Common Dead-Letter Causes

```
Twilio outage            → retry when service restored
Malformed payload        → requires code fix before retry
Deleted downstream resource → dismiss (resource no longer exists)
Worker bug               → requires deploy + retry
Third-party rate limit   → retry with delay
```

---

# 13. Core Business Event Flows

Full end-to-end flows showing Layer 1 → Layer 2 → Layer 3.

---

## Flow 1 — Missed Call Text-Back

```
TWILIO WEBHOOK
→ POST /api/webhooks/twilio/voice
→ Verify Twilio signature (reject if invalid)

BEGIN TRANSACTION
  → Find or create contact by caller_phone (E.164, dedup check)
  → Create or find conversation (channel = missed_call)
  → INSERT outbox_events (
      event_type:   'call.missed',
      idempotency:  'call.missed:{call_sid}',
      payload:      { org_id, caller_phone, contact_id, call_sid }
    )
COMMIT

OUTBOX WORKER
→ Claims 'call.missed' event
→ Dispatches to queue:missed-call-textback

BULLMQ WORKER
→ Checks sms_opt_out
→ Checks automation_settings.missed_call_textback_enabled
→ Sends SMS via Twilio
→ Records automation_jobs row
→ INSERTs notifications row (type: 'missed_call_handled')

SUPABASE REALTIME
→ Contractor sees notification
```

---

## Flow 2 — Opportunity Won → Job Created

```
API ROUTE: PATCH /api/opportunities/:id/stage

BEGIN TRANSACTION
  → UPDATE opportunities SET stage_id = won_stage_id, closed_at = now()
  → INSERT jobs (opportunity_id, contact_id, title, status = 'scheduled')
  → UPDATE contacts SET status = 'customer'
  → INSERT outbox_events (
      event_type:   'opportunity.won',
      idempotency:  'opportunity.won:{opportunity_id}',
      payload:      { opportunity_id, org_id, contact_id, job_id }
    )
  → INSERT outbox_events (
      event_type:   'job.created',
      sequence:     2,
      idempotency:  'job.created:{job_id}',
      payload:      { job_id, org_id, contact_id, opportunity_id }
    )
COMMIT

OUTBOX WORKER
→ Claims both events (ordered by sequence)
→ Dispatches to queue:notification-dispatch

BULLMQ WORKER
→ INSERTs notifications row (type: 'new_job')

SUPABASE REALTIME
→ Contractor sees "New job created" notification
```

---

## Flow 3 — Quote Accepted

```
CLIENT VISITS QUOTE LINK
→ GET /q/:quote_token

API ROUTE: POST /api/quotes/:id/accept

BEGIN TRANSACTION
  → UPDATE quotes SET status = 'accepted', accepted_at = now()
  → INSERT outbox_events (
      event_type:   'quote.accepted',
      idempotency:  'quote.accepted:{quote_id}',
      payload:      { quote_id, org_id, contact_id, total, opportunity_id }
    )
COMMIT

NOTE: Opportunity stage is NOT automatically advanced.
      Staff manually moves opportunity to Won when operationally ready.

OUTBOX WORKER
→ Claims 'quote.accepted' event
→ Dispatches to queue:notification-dispatch

BULLMQ WORKER
→ Cancels pending quote_followup automation_jobs
→ INSERTs notifications row (type: 'quote_accepted')

SUPABASE REALTIME
→ Contractor sees "Quote accepted — $4,500" notification instantly
```

---

## Flow 4 — Invoice Paid

```
STRIPE WEBHOOK
→ POST /api/webhooks/stripe
→ stripe.webhooks.constructEvent() (reject if invalid)
NOTE: Webhook secret is per-org - loaded from organizations.stripe_webhook_secret
for the org that owns this invoice. Not a platform-wide secret.
Each contractor's Stripe account sends webhooks to the same endpoint,
but verified with their individual signing secret.
→ Webhook URL registered per org: https://yourapp.com/api/webhooks/stripe?org_id=xxx
→ Event type: payment_intent.succeeded

BEGIN TRANSACTION
  → INSERT payments (invoice_id, amount, stripe_payment_intent_id, ...)
    ON CONFLICT (stripe_payment_intent_id) DO NOTHING  ← idempotency
  → UPDATE invoices SET amount_paid = ..., amount_due = ..., status = 'paid', paid_at = now()
  → INSERT outbox_events (
      event_type:   'invoice.paid',
      idempotency:  'invoice.paid:{invoice_id}:{stripe_payment_intent_id}',
      payload:      { invoice_id, org_id, contact_id, total, paid_at }
    )
COMMIT

OUTBOX WORKER
→ Claims 'invoice.paid' event
→ Dispatches to queue:notification-dispatch AND queue:invoice-reminder (cancel)

BULLMQ WORKERS
→ Cancels pending invoice_reminder automation_jobs
→ INSERTs notifications row (type: 'payment_received')

SUPABASE REALTIME
→ Contractor sees "Payment received — $4,500" notification
```

---

## Flow 5 — Job Completed → Review Funnel

```
API ROUTE: PATCH /api/jobs/:id/status { status: 'completed' }

BEGIN TRANSACTION
  → UPDATE jobs SET status = 'completed', completed_at = now()
  → INSERT outbox_events (
      event_type:   'job.completed',
      idempotency:  'job.completed:{job_id}',
      payload:      { job_id, org_id, contact_id, opportunity_id }
    )
COMMIT

OUTBOX WORKER
→ Claims 'job.completed' event
→ Dispatches to queue:review-request (with delay = review_funnel_delay_hours)

BULLMQ WORKER (after delay)
→ Checks UNIQUE(job_id) on review_requests — guards against retry duplicates
→ Checks sms_opt_out on contact
→ Checks automation_settings.review_funnel_enabled
→ INSERTs review_requests row (status = 'sent')
→ Sends review request SMS via Twilio
→ Records automation_jobs row (status = 'completed')

CONTACT RESPONDS
→ score ≥ 4: POST /api/review-response/:token { score: 5 }
             → INSERT reviews row
             → Send Google review link SMS
→ score ≤ 3: POST /api/review-response/:token { score: 2 }
             → INSERT private_feedback row
             → INSERT outbox_events ('private_feedback.received')
             → Contractor notified via notifications
```

---

# 14. Naming Conventions

## Event Types

```
Pattern: {domain}.{past_tense_verb}

Examples:
  job.completed       ✅
  quote.accepted      ✅
  invoice.paid        ✅
  call.missed         ✅

NOT:
  jobCompleted        ❌ (camelCase)
  JOB_COMPLETED       ❌ (SCREAMING_SNAKE)
  job-completed       ❌ (kebab-case)
  on_job_complete     ❌ (imperative)
```

## Resource Types

```
Singular lowercase noun matching table name (without plural):
  job, quote, invoice, contact, opportunity, appointment,
  conversation, message, review_request, review, payment
```

## Queue Names

```
Pattern: queue:{kebab-case-automation-name}

Examples:
  queue:missed-call-textback
  queue:quote-followup
  queue:invoice-reminder
```

---

# 15. What This Document Enables

With this event architecture defined, the following phases can now proceed without ambiguity:

| Phase                        | Now Unblocked By                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------- |
| Core Schema Design           | `outbox_events` shape confirmed. `org_counters` confirmed. All event types known. |
| Constraint & Index Spec      | Idempotency constraints defined. Concurrency patterns defined.                    |
| RLS Policy Matrix            | JWT claims confirmed. Layer responsibilities confirmed.                           |
| API Boundary Spec            | Transaction boundaries defined. Outbox insertion pattern defined.                 |
| BullMQ Worker Implementation | Queue names, worker checklist, idempotency patterns all defined.                  |
| Webhook Handlers             | Twilio + Stripe patterns with signature verification + idempotency defined.       |

---

_Event System Architecture v1 — Approved_ _3 layers defined. 30 event types catalogued. Full payload contracts. Outbox worker mechanics. Idempotency strategy. Dead-letter operations. Concurrency patterns. 5 core business flows end-to-end._ _Ready for Phase 1 Step 3 — Core Schema Design._
