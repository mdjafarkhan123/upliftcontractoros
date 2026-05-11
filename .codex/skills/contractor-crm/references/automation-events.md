# Automation & Events Reference

Cross-reference: Master Domain Architecture v1 (Rules 28–30, Section 7),
Core Schema Design v1 (outbox_events, automation_jobs, automation_settings),
Blueprint v3 (Section 10–11).

---

## Table of Contents

1. Three-Layer Architecture
2. Transaction Boundary Law
3. Outbox Pattern
4. outbox_events vs automation_jobs
5. Idempotency Key Strategy
6. BullMQ Automation Types & Triggers
7. Automation Settings Defaults
8. Dead-Letter Handling
9. Supabase Realtime Boundaries
10. Core Events List
11. Webhook Security
12. Contact Activity Timeline

---

## 1. Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 1 — TRANSACTIONAL CORE                           │
│  PostgreSQL + Drizzle ORM                               │
│                                                         │
│  Responsible for:                                       │
│  → Source of truth for all business state                │
│  → Atomic multi-table operations                        │
│  → Constraints, indexes, RLS                            │
│  → outbox_events insertion (inside transaction)         │
│                                                         │
│  NEVER:                                                 │
│  → Send SMS, email, or push notifications               │
│  → Enqueue BullMQ jobs directly                         │
│  → Call external APIs                                   │
└──────────────────────┬──────────────────────────────────┘
                       │ COMMIT includes outbox_events row
                       ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 2 — RELIABLE ASYNC INFRASTRUCTURE                │
│  outbox_events + Outbox Worker + BullMQ + Redis         │
│                                                         │
│  Responsible for:                                       │
│  → Guaranteed at-least-once event delivery               │
│  → Retry semantics and dead-letter handling              │
│  → Automation orchestration                              │
│  → Async fanout (notifications, SMS, email)              │
│  → Idempotency enforcement                               │
│                                                         │
│  NEVER:                                                 │
│  → Mutate business state without going through Layer 1  │
│  → Deliver real-time UI updates (that is Layer 3)       │
└──────────────────────┬──────────────────────────────────┘
                       │ BullMQ worker inserts notifications row
                       ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 3 — REACTIVE UX LAYER                            │
│  Supabase Realtime                                      │
│                                                         │
│  Responsible for:                                       │
│  → Live in-app notification delivery                     │
│  → Inbox real-time message updates                       │
│  → Dashboard live refreshes                              │
│  → UI state synchronization                              │
│                                                         │
│  NEVER:                                                 │
│  → Durable automation processing                         │
│  → Business-critical orchestration                       │
│  → Retry guarantees                                      │
│  → Replacing outbox_events                               │
└─────────────────────────────────────────────────────────┘
```

**Critical rule:** Supabase Realtime is NOT an event bus. It is a UI delivery
mechanism only. A missed Realtime notification is a UX inconvenience. A missed
outbox event is a business failure. They must never be confused.

---

## 2. Transaction Boundary Law (Rule 28)

Every business operation with side effects follows this pattern:

```
INSIDE the database transaction:
  → All business row mutations (contacts, quotes, invoices, etc.)
  → outbox_events row insertion

OUTSIDE the database transaction (triggered by outbox worker after commit):
  → BullMQ job enqueue
  → Twilio SMS dispatch
  → Resend email dispatch
  → Supabase Realtime publish
  → Stripe API calls
  → Any external API call
```

Never enqueue BullMQ, send SMS, or call external services inside a database
transaction. If the transaction rolls back, the external call cannot be undone.
The outbox pattern is the only correct boundary.

---

## 3. Outbox Pattern

### How the Outbox Worker Claims Events

```sql
-- Worker polling query (runs every 30s as fallback, or triggered by pg_notify)
SELECT * FROM outbox_events
WHERE status = 'pending'
  AND available_at <= now()
ORDER BY sequence ASC
FOR UPDATE SKIP LOCKED
LIMIT 10;
```

- `FOR UPDATE SKIP LOCKED` — safe for multiple concurrent worker instances
- Worker is woken immediately by `pg_notify('outbox_channel', NEW.id::text)` on INSERT
- 30-second polling is the resilience fallback if pg_notify is missed
- `sequence` (SERIAL auto-increment) guarantees processing order within a transaction
- `available_at > now()` enables delayed processing (review funnel delay, quote follow-up delay)

### Outbox Event Lifecycle

```
pending → processing → processed    (success)
                     → failed       (retriable — attempts < max_attempts)
                     → dead_lettered (attempts = max_attempts — needs manual review)
```

- `max_attempts` defaults to 3
- `event_version` (integer, default 1) supports forward-compatible payload schema changes
- `org_id` is nullable — null for platform-level events (monthly cron, org status transitions)
- Never deleted — permanent dispatch audit trail

### pg_notify Trigger

```sql
CREATE OR REPLACE FUNCTION public.notify_outbox_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  PERFORM pg_notify('outbox_channel', NEW.id::text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER outbox_notify
AFTER INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION public.notify_outbox_insert();
```

---

## 4. outbox_events vs automation_jobs

These are NOT interchangeable. Both must exist. Neither replaces the other.

| Concern            | `outbox_events`                     | `automation_jobs`                    |
| ------------------ | ----------------------------------- | ------------------------------------ |
| Responsibility     | Dispatch guarantee (infrastructure) | Execution audit trail (observability)|
| Question answered  | "Did this event get delivered?"     | "What did the automation do?"        |
| Written when       | Inside DB transaction with business mutation | Before BullMQ job is enqueued |
| Updated by         | Outbox worker                       | BullMQ worker as job progresses      |
| Retry semantics    | Worker retry with dead-letter       | BullMQ built-in retry (max 3)       |
| Contains           | Event payload (JSONB)               | Resource reference + bull_job_id     |
| Deleted            | Never                               | Never                                |

---

## 5. Idempotency Key Strategy

### Domain Events (fire once per lifecycle transition)
Format: `{event_type}:{resource_id}`

```
job.completed:abc-123
quote.accepted:def-456
invoice.paid:ghi-789
opportunity.won:abc-123
lead.created:xyz-789
```

These use the UNIQUE index on `outbox_events.idempotency_key`. A duplicate business
event (from concurrent requests, webhook retries, or automation replays) will fail
the INSERT gracefully — no duplicate processing.

### Scheduled Automation Events (may recur on same resource)
Format: `{event_type}:{automation_job_id}`

```
quote.followup:bullmq-job-id-001
invoice.reminder:bullmq-job-id-002
appointment.reminder:bullmq-job-id-003
```

These key on the automation_job_id (not the resource_id) because the same resource
may legitimately have multiple scheduled automation events over time.

### Notification Idempotency
`notifications.idempotency_key` is NULLABLE:
- **Set** for deduplicable events: `{event_type}:{resource_id}:{member_id}` — partial unique index blocks duplicates
- **NULL** for repeatable notifications (reminders, follow-ups) — allows multiple rows

---

## 6. BullMQ Automation Types & Triggers

| Automation Type          | Trigger Event        | What It Does                                    |
| ------------------------ | -------------------- | ----------------------------------------------- |
| `missed_call_textback`   | `call.missed`        | SMS to caller within seconds + lead creation    |
| `speed_to_lead`          | `lead.created`       | Instant SMS confirmation to new lead            |
| `quote_followup`         | `quote.sent` + delay | Follow-up SMS at 24h and 72h (two reminders)    |
| `invoice_reminder`       | `invoice.overdue`    | Reminder SMS; reschedules until paid             |
| `review_request`         | `job.completed`      | Review request SMS after configurable delay      |
| `appointment_reminder`   | `appointment.booked` | 24h and 1h before appointment                   |

### Automation Cancellation Rules
- `quote_followup`: cancelled when quote is accepted, declined, or expired
- `invoice_reminder`: cancelled when invoice is paid or cancelled
- `appointment_reminder`: cancelled and re-created on reschedule (with flag reset)

### Worker Rules
- Max retry attempts: 3 by default for all types
- After 3 failed attempts: `status → failed`, `last_error` recorded, no further retries
- Every worker MUST check `contacts.sms_opt_out` before sending any SMS
- One `automation_jobs` row per BullMQ job — created before enqueue
- `bull_job_id` links DB record to BullMQ queue for management

### Split Automation Model
```
BullMQ (Redis) — tenant-critical, time-sensitive automations
  → missed_call_textback, speed_to_lead, quote_followup,
    invoice_reminder, review_request, appointment_reminder

N8N (self-hosted) — agency marketing workflows, non-time-critical
  → GBP post publishing, social media, campaigns,
    scheduled reporting, third-party integrations, review responses
```

N8N is NOT the backend. The application backend is the source of truth.
N8N reacts to events emitted by the backend. N8N never owns business logic,
authentication, or tenant data.

---

## 7. Automation Settings Defaults

One `automation_settings` row per org, created automatically on org creation.
All settings accessible to Admin only in Contractor App.
Agency team configures during onboarding.

| Setting                               | Default                |
| ------------------------------------- | ---------------------- |
| `missed_call_textback_enabled`        | TRUE                   |
| `missed_call_textback_message`        | "Hi! We missed your call. We'll be in touch shortly — or reply here and we'll get back to you right away." |
| `quote_followup_enabled`              | TRUE                   |
| `quote_followup_delay_1_hours`        | 24                     |
| `quote_followup_delay_2_hours`        | 72                     |
| `quote_followup_message`              | "Hi {contact_name}, just following up on the quote we sent. Any questions? We're happy to help." |
| `invoice_reminder_enabled`            | TRUE                   |
| `invoice_reminder_delay_days`         | 3                      |
| `invoice_reminder_message`            | "Hi {contact_name}, just a reminder that your invoice is due. Please don't hesitate to reach out if you have any questions." |
| `review_funnel_enabled`               | TRUE                   |
| `review_funnel_delay_hours`           | 2                      |
| `google_review_link`                  | NULL (set by agency)   |
| `review_funnel_message`               | "Hi {contact_name}, thank you for choosing us! How did we do today? Reply with a number from 1–5." |
| `appointment_reminder_enabled`        | TRUE                   |
| `appointment_reminder_hours_before`   | 24                     |
| `appointment_reminder_message`        | "Hi {contact_name}, just a reminder about your appointment tomorrow. Reply STOP to opt out." |
| `speed_to_lead_enabled`               | TRUE                   |
| `speed_to_lead_message`               | "Hi {contact_name}, thanks for reaching out! We'll get back to you shortly." |

Message templates support `{contact_name}` and `{org_name}` interpolation at send time.
The same `quote_followup_message` is used for both follow-up reminders.

---

## 8. Dead-Letter Handling (Rule 30)

When `outbox_events.status` reaches `dead_lettered`:
- Event is surfaced in the `/jafar` super admin panel
- Platform Owner can inspect `last_error` and `payload`
- Manual retry is possible via the admin panel
- The affected org may need operational follow-up

Dead-lettered events must NEVER be silently ignored. They represent a business
operation that failed to complete.

Index for `/jafar` visibility:
```sql
CREATE INDEX idx_outbox_events_dead_lettered
  ON outbox_events (org_id, dead_lettered_at)
  WHERE status = 'dead_lettered';
```

---

## 9. Supabase Realtime Boundaries

Supabase Realtime is used for:
- Live in-app notification delivery (notification bell)
- Inbox real-time message updates
- Dashboard live refreshes
- UI state synchronization

Supabase Realtime is NEVER used for:
- Durable automation processing
- Business-critical orchestration
- Retry guarantees
- Replacing the outbox pattern

A missed Realtime notification = UX inconvenience (user refreshes page).
A missed outbox event = business failure (payment not processed, SMS not sent).

---

## 10. Core Events List

Events emitted by the application via outbox_events:

| Event                   | Emitted When                               | Triggers                                    |
| ----------------------- | ------------------------------------------ | ------------------------------------------- |
| `lead.created`          | New contact created as lead                | speed_to_lead SMS, new_lead notification    |
| `call.missed`           | Twilio missed call webhook                 | missed_call_textback SMS                    |
| `conversation.created`  | First message with contact on a channel    | —                                           |
| `message.received`      | Inbound message from contact               | Realtime inbox update, notification         |
| `quote.sent`            | Quote status → sent                        | quote_followup automation (24h, 72h delay)  |
| `quote.viewed`          | First qualifying view of quote             | quote_viewed notification                   |
| `quote.accepted`        | Customer accepts quote                     | quote_accepted notification, cancel followup|
| `opportunity.won`       | Opportunity moved to Won stage             | Job creation, contact status → customer     |
| `job.created`           | Job row inserted (from Won trigger)        | —                                           |
| `job.completed`         | Job status → completed                     | review_request automation                   |
| `invoice.sent`          | Invoice status → sent                      | —                                           |
| `invoice.overdue`       | Nightly cron detects past-due invoice      | invoice_reminder automation                 |
| `invoice.paid`          | Invoice fully paid (amount_due = 0)        | payment_received notification, cancel reminder |
| `appointment.booked`    | Appointment created                        | appointment_reminder automation (24h, 1h)   |
| `review.received`       | Positive review (score ≥ 4) recorded       | new_review notification                     |
| `negative_feedback`     | Negative feedback (score ≤ 3) recorded     | negative_feedback notification              |

---

## 11. Webhook Security

### Twilio Webhooks
- Signature verification middleware on EVERY Twilio webhook route — non-negotiable
- Validate using Twilio's request signing mechanism before processing any payload
- `messages.twilio_message_sid` has partial unique index — prevents duplicate processing

### Stripe Webhooks
- `stripe.webhooks.constructEvent()` on EVERY payment webhook — non-negotiable
- Verify webhook signature using `stripe_webhook_secret` from `organizations` table
- `payments.stripe_payment_intent_id` has partial unique index — prevents double-payment
- Each contractor has their own Stripe account (restricted key model)
- Platform never holds, processes, or intermediates contractor revenue

Both must be implemented before first production deployment.

---

## 12. Contact Activity Timeline

The contact detail view shows a unified chronological timeline. This is NOT a separate
table — it is assembled at query time via UNION across entities, all filtered by
`contact_id` and `org_id`.

### Timeline Sources
```
messages          → "SMS received/sent — ..."
quotes            → "Quote Q-0042 sent — $4,500" / "Quote accepted"
quote_views       → "Quote Q-0042 viewed"
invoices          → "Invoice INV-0042 sent" / "Invoice paid in full"
payments          → "Payment received — $2,250"
appointments      → "Appointment scheduled — May 15 at 9:00am" / "completed"
jobs              → "Job created — Roof Replacement" / "Job completed"
review_requests   → "Review request sent"
reviews           → "5-star review received"
private_feedback  → "Negative feedback received"
contact_notes     → "Note by Sarah: Customer prefers contact after 2pm"
automation_jobs   → "Missed call text-back sent"
```

### Pagination
Must use cursor-based pagination (not offset):
```sql
WHERE (created_at, source_table, id) < (:cursor_ts, :cursor_table, :cursor_id)
ORDER BY created_at DESC, source_table DESC, id DESC
LIMIT 50
```

Compound cursor prevents row loss when multiple events share identical timestamps.
API response must include a `next_cursor` value.
