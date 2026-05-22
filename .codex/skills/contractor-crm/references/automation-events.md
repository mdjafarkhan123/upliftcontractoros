# Automation & Events Reference — Event Catalog

Cross-reference: Event System Architecture v1 (authoritative source),
outbox-worker.md (infrastructure mechanics), bullmq-workers.md (worker implementation),
event-flows.md (end-to-end business flows + concurrency patterns).

---

## Table of Contents

1. Complete Event Catalog (31 events, 7 domains)
2. Event Payload Contracts
3. Idempotency Key Strategy
4. Event Naming Conventions
5. Event Versioning Strategy

---

## 1. Complete Event Catalog

Every event in the system. Organised by domain. All event types follow
`{domain}.{past_tense_verb}` format. See Section 4 for naming rules.

> ⚠️ Naming corrections vs legacy notes:
> `lead.created` → `contact.created` | `appointment.booked` → `appointment.created`
> `negative_feedback` → `private_feedback.received`

---

### Domain: Contact

| Event Type                    | Trigger                                          | Resource |
| ----------------------------- | ------------------------------------------------ | -------- |
| `contact.created`             | New contact created (inbound lead, manual entry) | contact  |
| `contact.duplicate_detected`  | Inbound lead matches existing phone in same org  | contact  |
| `contact.status_changed`      | Status transitions (e.g. lead → customer)        | contact  |
| `contact.sms_opted_in`        | Contact sends START/YES after prior opt-out      | contact  |

---

### Domain: Pipeline

| Event Type                  | Trigger                                            | Resource    |
| --------------------------- | -------------------------------------------------- | ----------- |
| `opportunity.created`       | New opportunity added to pipeline                  | opportunity |
| `opportunity.stage_changed` | Opportunity moved between pipeline stages          | opportunity |
| `opportunity.won`           | Opportunity reaches Won stage — triggers job creation | opportunity |
| `opportunity.lost`          | Opportunity reaches Lost stage                     | opportunity |

---

### Domain: Jobs

| Event Type          | Trigger                                          | Resource |
| ------------------- | ------------------------------------------------ | -------- |
| `job.created`       | Job created from Won opportunity (only path)     | job      |
| `job.assigned`      | Job assigned to a team member                    | job      |
| `job.status_changed`| Job status transitions                           | job      |
| `job.completed`     | Job marked complete — triggers review funnel     | job      |
| `job.cancelled`     | Job cancelled                                    | job      |

---

### Domain: Communication

| Event Type             | Trigger                                     | Resource     |
| ---------------------- | ------------------------------------------- | ------------ |
| `conversation.created` | New conversation opened                     | conversation |
| `message.received`     | Inbound message from contact                | message      |
| `message.sent`         | Outbound message to contact                 | message      |
| `call.missed`          | Missed call received via Twilio webhook     | conversation |

---

### Domain: Revenue

| Event Type        | Trigger                                          | Resource |
| ----------------- | ------------------------------------------------ | -------- |
| `quote.created`   | New quote drafted                                | quote    |
| `quote.sent`      | Quote sent to contact                            | quote    |
| `quote.viewed`    | Contact opens quote link (qualifying view)       | quote    |
| `quote.accepted`  | Contact accepts quote                            | quote    |
| `quote.deposit_paid` | Quote deposit payment succeeds via Stripe     | quote    |
| `quote.declined`  | Contact declines quote                           | quote    |
| `quote.expired`   | Quote passes expiry date unresponded             | quote    |
| `invoice.created` | New invoice created                              | invoice  |
| `invoice.sent`    | Invoice sent to contact                          | invoice  |
| `invoice.paid`    | Invoice fully paid (amount_due = 0)              | invoice  |
| `invoice.overdue` | Invoice passes due date unpaid (nightly cron)    | invoice  |
| `payment.recorded`| Payment recorded against invoice                 | payment  |

---

### Domain: Appointments

| Event Type                   | Trigger                                   | Resource    |
| ---------------------------- | ----------------------------------------- | ----------- |
| `appointment.created`        | Appointment scheduled                     | appointment |
| `appointment.rescheduled`    | Appointment time changed                  | appointment |
| `appointment.completed`      | Appointment marked complete               | appointment |
| `appointment.cancelled`      | Appointment cancelled                     | appointment |
| `appointment.no_show`        | Contact did not attend                    | appointment |

---

### Domain: Reputation

| Event Type                  | Trigger                                          | Resource         |
| --------------------------- | ------------------------------------------------ | ---------------- |
| `review_request.sent`       | Review request SMS dispatched                    | review_request   |
| `review.received`           | Positive review captured (score ≥ 4)             | review           |
| `private_feedback.received` | Negative feedback submitted (score ≤ 3)          | private_feedback |

---

### Domain: Automation (Scheduled — BullMQ-dispatched)

These fire via BullMQ after a triggering domain event. Idempotency key uses
`automation_job_id`, not `resource_id` — same resource may receive multiple
automation events over its lifetime.

| Event Type                          | BullMQ Trigger                              | Resource    |
| ----------------------------------- | ------------------------------------------- | ----------- |
| `automation.missed_call_textback`   | `call.missed` + near-instant delay          | conversation|
| `automation.speed_to_lead`          | `contact.created` + near-instant delay      | contact     |
| `automation.quote_followup`         | `quote.sent` + 24h delay / 72h delay        | quote       |
| `automation.invoice_reminder`       | `invoice.overdue` + configurable delay      | invoice     |
| `automation.review_request`         | `job.completed` + configurable delay        | job         |
| `automation.appointment_reminder_24h`| `appointment.created` + calculated delay   | appointment |
| `automation.appointment_reminder_1h` | `appointment.created` + calculated delay   | appointment |

---

### Domain: Platform (System-level, org_id = null)

| Event Type                        | Trigger                    | Resource |
| --------------------------------- | -------------------------- | -------- |
| `platform.monthly_summary`        | First day of month cron    | null     |
| `platform.org_deletion_sweep`     | Nightly cron               | null     |
| `platform.notification_cleanup`   | Nightly cron               | null     |

---

## 2. Event Payload Contracts

Every event carries a typed payload in `outbox_events.payload JSONB`.
Fields listed below are the minimum required. Additional context fields are permitted.

---

### `contact.created`

```json
{
  "contact_id": "uuid",
  "org_id": "uuid",
  "phone": "string E.164",
  "lead_source": "string",
  "created_at": "ISO8601 timestamp"
}
```

### `contact.sms_opted_in`

```json
{
  "contact_id": "uuid",
  "org_id": "uuid",
  "phone": "string E.164",
  "opted_in_at": "ISO8601 timestamp"
}
```

### `call.missed`

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

### `opportunity.won`

```json
{
  "opportunity_id": "uuid",
  "org_id": "uuid",
  "contact_id": "uuid",
  "stage_id": "uuid",
  "won_at": "ISO8601 timestamp"
}
```

### `job.completed`

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

### `quote.accepted`

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

### `quote.viewed`

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

### `quote.deposit_paid`

```json
{
  "quote_id": "uuid",
  "org_id": "uuid",
  "contact_id": "uuid",
  "opportunity_id": "uuid | null",
  "deposit_paid_amount": "integer cents",
  "deposit_paid_at": "ISO8601 timestamp",
  "stripe_payment_intent_id": "string",
  "deposit_applied_invoice_id": "uuid | null"
}
```

### `invoice.paid`

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

### `invoice.overdue`

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

### `appointment.rescheduled`

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

### `automation.quote_followup`

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

### `automation.review_request`

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

## 3. Idempotency Key Strategy

Idempotency key semantics define replay behaviour. Wrong keys = wrong replay.
`outbox_events.idempotency_key` has a `UNIQUE` constraint — duplicate INSERTs
fail gracefully, preventing double side effects.

### Domain Events — Resource-Scoped Keys

Fire exactly once per lifecycle transition on a given resource.

```
Pattern:  {event_type}:{resource_id}

Examples:
  job.completed:job-uuid-abc
  quote.accepted:quote-uuid-def
  quote.deposit_paid:quote-uuid-def:pi_123
  invoice.paid:invoice-uuid-ghi
  opportunity.won:opp-uuid-jkl
  contact.created:contact-uuid-mno
```

Duplicate insert (webhook retry, race condition) → UNIQUE constraint fails gracefully.
The business operation already completed. No duplicate side effects.

### Scheduled Automation Events — Execution-Scoped Keys

May fire multiple times on the same resource over its lifetime.

```
Pattern:  {event_type}:{automation_job_id}

Examples:
  automation.quote_followup:automation-job-uuid-001
  automation.invoice_reminder:automation-job-uuid-002
  automation.appointment_reminder_24h:automation-job-uuid-003
```

`automation_job_id` is the idempotency anchor — each scheduled execution is a
distinct event instance. The same quote can have multiple follow-up events.
The same invoice can have multiple reminders. Each is independently idempotent.

### Platform Events — Operation-Scoped Keys

```
Pattern:  {event_type}:{date_bucket}:{optional_scope}

Examples:
  platform.monthly_summary:2026-05-01
  platform.org_deletion_sweep:2026-05-08
  platform.notification_cleanup:2026-05-08
```

### Notification Idempotency

`notifications.idempotency_key` is NULLABLE:
- **Set** for deduplicable events: `{event_type}:{resource_id}:{member_id}`
  — partial unique index blocks duplicates
- **NULL** for repeatable notifications (reminders, follow-ups) — allows multiple rows

---

## 4. Event Naming Conventions

### Event Types

```
Pattern: {domain}.{past_tense_verb}

✅  job.completed
✅  quote.accepted
✅  invoice.paid
✅  call.missed

❌  jobCompleted       (camelCase)
❌  JOB_COMPLETED      (SCREAMING_SNAKE)
❌  job-completed      (kebab-case)
❌  on_job_complete    (imperative)
```

### Resource Types

Singular lowercase noun matching the table name (without plural suffix):

```
job, quote, invoice, contact, opportunity, appointment,
conversation, message, review_request, review, payment
```

### Queue Names

```
Pattern: queue:{kebab-case-automation-name}

Examples:
  queue:missed-call-textback
  queue:speed-to-lead
  queue:quote-followup
  queue:invoice-reminder
  queue:review-request
  queue:appointment-reminder
  queue:notification-dispatch
```

---

## 5. Event Versioning Strategy

All outbox events carry `event_version integer default 1`.

### Rules

```
Version 1 is the initial payload schema.

When a payload schema changes:
  → bump event_version to 2
  → consumers must handle BOTH v1 and v2
  → never remove fields from v1 during a rolling deploy
  → old events in the outbox still carry v1 — they must remain processable

Version upgrade procedure:
  1. Deploy new consumer that handles v1 and v2
  2. Deploy new producer that emits v2
  3. After all v1 events are processed, clean up v1 handling
```

### Example

```json
// Version 1
{ "event_version": 1, "job_id": "uuid", "contact_id": "uuid" }

// Version 2 — adds assigned_to
{ "event_version": 2, "job_id": "uuid", "contact_id": "uuid", "assigned_to": "uuid | null" }
```

```typescript
if (payload.event_version === 1) {
  // handle without assigned_to
} else if (payload.event_version >= 2) {
  // handle with assigned_to
}
```
