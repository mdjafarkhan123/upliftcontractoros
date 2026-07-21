# BullMQ Workers Reference

Cross-reference: Event System Architecture v1 (authoritative source),
outbox-worker.md (outbox infrastructure), automation-events.md (event catalog),
event-flows.md (end-to-end business flows).

---

## Table of Contents

1. BullMQ Queue Names
2. Automation Types & Triggers
3. Worker Idempotency Pattern
4. Worker Checklist
5. Job Cancellation Pattern
6. Notification Dispatch Chain
7. Automation Settings Defaults
8. Split Automation Model (BullMQ vs N8N)
9. Webhook Security

---

## 1. BullMQ Queue Names

```
queue:missed-call-textback
queue:speed-to-lead
queue:quote-followup
queue:invoice-reminder
queue:review-request
queue:appointment-reminder
queue:notification-dispatch
```

---

## 2. Automation Types & Triggers

| Automation Type            | Trigger Event                 | Queue                        | What It Does                                                           |
| -------------------------- | ----------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `missed_call_textback`     | `call.missed`                 | `queue:missed-call-textback` | SMS to caller within seconds + lead creation                           |
| `speed_to_lead`            | `contact.created`             | `queue:speed-to-lead`        | Instant SMS confirmation to new contact/lead                           |
| `quote_followup`           | `quote.sent` + delay          | `queue:quote-followup`       | Follow-up SMS at 24h and 72h (two reminders)                           |
| `invoice_reminder`         | `invoice.overdue`             | `queue:invoice-reminder`     | Reminder SMS; reschedules until paid                                   |
| `review.send`              | `job.completed` + delay       | `automation`                 | Creates review_request `sent`, queues SMS, emits `review_request.sent` |
| `review.unengaged`         | `review_request.sent` +72h    | `automation`                 | One-shot reminder if still `status='sent'`                             |
| `review.nudge_1`           | `review_request.engaged` +24h | `automation`                 | Nudge if `status='engaged' AND nudge_count=0`; bumps to 1              |
| `review.nudge_2`           | `review_request.engaged` +72h | `automation`                 | Nudge if `status='engaged' AND nudge_count=1`; bumps to 2              |
| `review.expire`            | `review_request.sent` +14d    | `automation`                 | Flips active rows to `expired` (terminal)                              |
| `appointment_reminder_24h` | `appointment.created`         | `queue:appointment-reminder` | Reminder SMS 24h before appointment                                    |
| `appointment_reminder_1h`  | `appointment.created`         | `queue:appointment-reminder` | Reminder SMS 1h before appointment                                     |

> ⚠️ Legacy note: trigger event was previously listed as `lead.created` for speed_to_lead
> and `appointment.booked` for appointment reminders. Correct names are above.

---

## 3. Worker Idempotency Pattern

Every BullMQ worker must check for prior execution before proceeding.
At-least-once delivery is guaranteed — exactly-once is the worker's responsibility.

```typescript
// Example: review.nudge_1 worker (engaged-stream).
//
// Retries are race-safe because the UPDATE includes
// `WHERE nudge_count = 0` — a second concurrent fire affects 0 rows.
async function handleReviewNudge1(job: Job) {
	const { review_request_id, org_id } = job.data;

	// Step 1 — Re-read state at fire time (never trust the queue payload alone)
	const rr = await loadActiveReviewRequest(org_id, review_request_id, ['engaged']);
	const { settings } = await loadContext(org_id);
	if (!rr || !settings?.review_funnel_enabled || rr.nudge_count !== 0) return;

	// Step 2 — Re-check SMS opt-out
	const contact = await loadContact(org_id, rr.contact_id);
	if (!contact || contact.sms_opt_out) return;

	// Step 3 — Atomic claim + dispatch in one transaction
	await db.transaction(async (tx) => {
		const updated = await tx
			.update(reviewRequests)
			.set({ nudge_count: 1, updated_at: new Date() })
			.where(
				and(
					eq(reviewRequests.id, rr.id),
					eq(reviewRequests.status, 'engaged'),
					eq(reviewRequests.nudge_count, 0)
				)
			)
			.returning({ id: reviewRequests.id });
		if (updated.length === 0) return; // someone else claimed it

		await queueAutomationSms(tx, {
			/* ... */
		});
		await emitReviewEvent(tx, {
			org_id,
			review_request_id: rr.id,
			type: 'nudge_sent',
			nudge_number: 1
		});
	});

	// Step 6 — Record in automation_jobs audit trail
	await recordAutomationJob(automation_job_id, 'completed');
}
```

The pattern is the same across all workers — only the idempotency check,
opt-out check, settings check, and side effect differ per automation type.

---

## 4. Worker Checklist

Every BullMQ worker must satisfy all of these before shipping:

```
□ Check idempotency before executing (unique DB constraint or explicit lookup)
□ Check automation_jobs.status — exit immediately if 'cancelled'
□ Check contacts.sms_opt_out before sending any SMS (TCPA compliance)
□ Check automation_settings before triggering any automation
□ Record result in automation_jobs (status: completed | skipped | failed)
□ Insert notifications row when user-facing
□ Check member_notification_preferences before dispatching
□ Handle Web Push dispatch if enabled and not throttled
□ Render all human-readable times in organizations.timezone — never raw UTC
```

---

## 5. Job Cancellation Pattern

When a business event makes a pending automation unnecessary
(e.g. quote accepted → cancel follow-up reminders):

```
Step 1 — Find pending automation_jobs rows:
  WHERE resource_type = {triggering entity type}
    AND resource_id   = {entity id}
    AND type          = {automation to cancel}
    AND status        = 'pending'

Step 2 — For each matching row:
  → bullmqQueue.remove(automation_jobs.bull_job_id)
  → UPDATE automation_jobs SET status = 'cancelled'

Step 3 — Safety net in every worker:
  Check automation_jobs.status at execution start.
  If status = 'cancelled', exit immediately.
  (Guards against the race where the job fires before Step 2 completes.)
```

### Cancellation Trigger Rules

```
quote_followup automation   → cancel on: quote.accepted, quote.declined, quote.expired
invoice_reminder automation → cancel on: invoice.paid, invoice cancelled
appointment_reminder        → cancel and re-create on: appointment.rescheduled
                               (reminder_flags_reset = true in payload)
```

---

## 6. Notification Dispatch Chain

How a business event becomes a visible in-app notification:

```
1. API route commits transaction
   → business rows updated
   → outbox_events row inserted
   → COMMIT

2. pg_notify fires → outbox worker wakes (30s polling as fallback)

3. Outbox worker claims row
   → dispatches to queue:notification-dispatch

4. BullMQ notification worker:
   → determines which org_member(s) receive this notification
   → checks member_notification_preferences
   → INSERT INTO notifications (member_id, type, metadata, route, ...)
   → if push enabled + not throttled: dispatches to Web Push service

5. Supabase Realtime detects notifications INSERT
   → pushes to subscribed client (In-App)

6. Web Push Service (optional branch):
   → sends to browser/device via push_subscriptions

7. Client UI updates:
   → notification bell badge increments
   → notification panel shows new item
   → (optional) OS-level push notification shown
```

Steps 1–4 are guaranteed by the outbox pattern.
Steps 5–7 are best-effort delivery.

If the client is offline, they see the notification on next app open by querying
the `notifications` table directly.

### Routing Example

```
contact.sms_opted_in → queue:notification-dispatch → Admin + Manager members notified
quote.deposit_paid → queue:notification-dispatch → members with quote/payment visibility notified
opportunity.created → queue:notification-dispatch → assignee (or Admin/Manager fallback) notified
opportunity.assignee_changed → queue:notification-dispatch → new assignee only; self-assignment is silent
opportunity.lost → queue:notification-dispatch → assignee (or Admin/Manager fallback) notified
opportunity.stage_changed → no queue (feed-only — activity_events only)
contact.status_changed → no queue (feed-only — activity_events only)
```

### Pipeline Notification Recipient Helper

`notificationWorker.pipelineRecipients(orgId, payload.assigned_to)` is the
shared recipient resolver for pipeline notifications:

- If `assigned_to` is a non-empty string → `[{ id: assigned_to }]`
- Otherwise → admin + manager members via `adminManagerMembers(orgId)`

Self-assignment is filtered inside `handleOpportunityAssigneeChanged` by
comparing `payload.new_assigned_to` with `payload.changed_by_member_id`
before dispatch — assigning yourself a deal does **not** produce a
notification.

---

## 7. Automation Settings Defaults

One `automation_settings` row per org, created automatically on org creation.
All settings accessible to Admin only in Contractor App.
Agency team configures during onboarding.

| Setting                             | Default                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `missed_call_textback_enabled`      | TRUE                                                                                                                         |
| `missed_call_textback_message`      | "Hi! We missed your call. We'll be in touch shortly — or reply here and we'll get back to you right away."                   |
| `quote_followup_enabled`            | TRUE                                                                                                                         |
| `quote_followup_delay_1_hours`      | 24                                                                                                                           |
| `quote_followup_delay_2_hours`      | 72                                                                                                                           |
| `quote_followup_message`            | "Hi {contact_name}, just following up on the quote we sent. Any questions? We're happy to help."                             |
| `invoice_reminder_enabled`          | TRUE                                                                                                                         |
| `invoice_reminder_delay_days`       | 3                                                                                                                            |
| `invoice_reminder_message`          | "Hi {contact_name}, just a reminder that your invoice is due. Please don't hesitate to reach out if you have any questions." |
| `review_funnel_enabled`             | TRUE                                                                                                                         |
| `review_funnel_delay_hours`         | 2                                                                                                                            |
| `google_review_link`                | NULL (set by agency)                                                                                                         |
| `review_funnel_message`             | "Hi {contact_name}, thank you for choosing us! How did we do today? Reply with a number from 1–5."                           |
| `appointment_reminder_enabled`      | TRUE                                                                                                                         |
| `appointment_reminder_hours_before` | 24                                                                                                                           |
| `appointment_reminder_message`      | "Hi {contact_name}, just a reminder about your appointment tomorrow. Reply STOP to opt out."                                 |
| `speed_to_lead_enabled`             | TRUE                                                                                                                         |
| `speed_to_lead_message`             | "Hi {contact_name}, thanks for reaching out! We'll get back to you shortly."                                                 |

Message templates support `{contact_name}` and `{org_name}` interpolation at send time.
The same `quote_followup_message` is used for both the 24h and 72h follow-up reminders.

---

## 8. Split Automation Model

```
BullMQ (Redis) — tenant-critical, time-sensitive automations
  → missed_call_textback, speed_to_lead, quote_followup,
    invoice_reminder, review_request, appointment_reminder

N8N (self-hosted) — agency marketing workflows, non-time-critical
  → GBP post publishing, social media, campaigns,
    scheduled reporting, third-party integrations, review responses
```

N8N is NOT the backend. The application backend is the source of truth.
N8N reacts to events emitted by the backend via outbox_events or webhooks.
N8N never owns business logic, authentication, or tenant data.

---

## 9. Webhook Security

### Twilio Webhooks

- Signature verification middleware on EVERY Twilio webhook route — non-negotiable
- Validate using Twilio's request signing mechanism before processing any payload
- `messages.twilio_message_sid` has partial unique index — prevents duplicate processing
- Reject the request entirely if signature is invalid — do not process

### Stripe Webhooks

- `stripe.webhooks.constructEvent()` on EVERY payment webhook — non-negotiable
- Webhook secret is **per-org** — loaded from `organizations.stripe_webhook_secret`
  for the org that owns the invoice; NOT a platform-wide secret
- Each contractor's Stripe account sends webhooks to the same endpoint,
  but verified with their individual signing secret
- Webhook URL registered per org: `https://yourapp.com/api/webhooks/stripe?org_id=xxx`
- Event type handled: `payment_intent.succeeded`
- `payments.stripe_payment_intent_id` has partial unique index — prevents double-payment
  (`ON CONFLICT (stripe_payment_intent_id) DO NOTHING` in the INSERT)
- `quotes.deposit_stripe_payment_intent_id` has partial unique index — prevents duplicate
  quote deposit handling and duplicate `quote.deposit_paid` events
- If Stripe fires `payment_intent.succeeded` twice: second insert hits the unique
  constraint, handler catches it, returns 200 OK — webhook acknowledged, no duplicate payment
- Each contractor has their own Stripe account (restricted key model)
- Platform never holds, processes, or intermediates contractor revenue

Both webhook handlers must be fully implemented and tested before first production deployment.
