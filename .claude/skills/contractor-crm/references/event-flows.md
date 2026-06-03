# Event Flows, Concurrency & Activity Timeline Reference

Cross-reference: Event System Architecture v1 (authoritative source),
outbox-worker.md (outbox mechanics), bullmq-workers.md (worker patterns),
automation-events.md (event catalog + payloads).

---

## Table of Contents

1. Core Business Event Flows
2. Concurrency Patterns
3. Contact Activity Timeline

---

## 1. Core Business Event Flows

Full Layer 1 → Layer 2 → Layer 3 end-to-end traces for every major business operation.

---

### Flow 1 — Missed Call Text-Back

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
→ Checks automation_jobs.status (cancel guard)
→ Checks contacts.sms_opt_out
→ Checks automation_settings.missed_call_textback_enabled
→ Sends SMS via Twilio
→ Records automation_jobs row (status: completed)
→ INSERTs notifications row (type: 'missed_call_handled')

SUPABASE REALTIME
→ Contractor sees notification
```

---

### Flow 2 — Opportunity Won → Job Created

```
API ROUTE: PATCH /api/opportunities/:id/stage

BEGIN TRANSACTION
  → UPDATE opportunities SET stage_id = won_stage_id, closed_at = now()
  → INSERT jobs (opportunity_id, contact_id, title, status = 'scheduled')
  → UPDATE contacts SET status = 'customer'
  → INSERT outbox_events × 4 (single batch):
        1. opportunity.stage_changed  idempotency: stage_changed:{move_request_id}
                                       payload includes from/to_stage_name, contact_id, assigned_to
        2. opportunity.won            idempotency: opportunity.won:{opp_id}
                                       payload includes contact_id, title, value, assigned_to
        3. job.created                idempotency: job.created:{job_id}
        4. contact.status_changed     idempotency: status_changed:{contact_id}:{opp_id}
                                       payload: { new_status: 'customer', triggered_by_opportunity_id }
COMMIT

NOTE: Jobs are ONLY created by the Won stage trigger. No other path creates a job.

OUTBOX WORKER (single tick, single tx)
→ Claims all 4 events (ordered by sequence ASC)
→ opportunity.stage_changed → no queue (feed-only); INSERT activity_events
→ opportunity.won           → queue:notification-dispatch; INSERT activity_events
→ job.created               → queue:notification-dispatch; INSERT activity_events
→ contact.status_changed    → no queue (feed-only); INSERT activity_events
→ Marks all 4 outbox rows processed

BULLMQ NOTIFICATION WORKER
→ opportunity.won: assignee (or admin/manager) — type 'opportunity.won'
→ job.created:    admin + manager — type 'job.created'

SUPABASE REALTIME
→ Contractor sees "Opportunity won" and "New job created" notifications
→ Dashboard Recent Activity feed populates with 4 entries (one per event)
```

---

### Flow 2b — Opportunity Created / Assigned / Stage Move / Lost

Smaller pipeline flows that share the same outbox → activity_events
machinery as Flow 2 above.

```
opportunity.created
  Producer: POST /api/pipeline/opportunities, public booking webhook
  Routing:  queue:notification-dispatch + activity_events
  Notify:   assignee if set; else admin + manager
  Idempotency: opportunity.created:{opp_id}

opportunity.assignee_changed   (NEW — replaces opportunity.updated)
  Producer: PATCH /api/pipeline/opportunities/[id] when assigned_to actually diffs
  Routing:  queue:notification-dispatch + activity_events
  Notify:   new assignee ONLY; self-assignment is silent
  Idempotency: opportunity.assignee_changed:{opp_id}:{new_assigned_to|null}
  Same-target reassignment is idempotent; reassigning to someone new is a fresh event.

opportunity.stage_changed
  Producer: PATCH /api/pipeline/opportunities/[id]/stage (every move, including won/lost)
  Routing:  activity_events ONLY — no notification, no queue
  Idempotency: opportunity.stage_changed:{move_request_id}  (client UUID, double-click safe)
  Payload includes from/to_stage_name so the feed can render "moved to {stage}" without joins.

opportunity.lost
  Producer: Stage move into is_lost stage (always co-emitted with stage_changed)
  Routing:  queue:notification-dispatch + activity_events
  Notify:   assignee if set; else admin + manager
  Idempotency: opportunity.lost:{opp_id}
```

The `opportunity.updated` event was removed. Title/value edits emit no
event. If you need an edit audit trail later, model it as a dedicated
table — do **not** revive `opportunity.updated`.

---

### Flow 3 — Quote Accepted

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

⚠️  NOTE: Opportunity stage is NOT automatically advanced.
    Staff manually moves opportunity to Won when operationally ready.
    Quote acceptance fires notification only — not a Won trigger.

OUTBOX WORKER
→ Claims 'quote.accepted' event
→ Dispatches to queue:notification-dispatch AND queue:quote-followup (cancel)

BULLMQ WORKERS
→ Cancels pending quote_followup automation_jobs for this quote
→ INSERTs notifications row (type: 'quote_accepted')

SUPABASE REALTIME
→ Contractor sees "Quote accepted — $4,500" notification
```

---

### Flow 4 — Invoice Paid (Stripe Webhook)

```
STRIPE WEBHOOK
→ POST /api/webhooks/stripe?org_id=xxx
→ stripe.webhooks.constructEvent() using organizations.stripe_webhook_secret
  (per-org secret — not platform-wide)
→ Reject if signature invalid
→ Event type: payment_intent.succeeded

BEGIN TRANSACTION
  → INSERT payments (invoice_id, amount, stripe_payment_intent_id, ...)
    ON CONFLICT (stripe_payment_intent_id) DO NOTHING  ← idempotency guard
  → UPDATE invoices SET amount_paid = ..., amount_due = ...,
        status = 'paid', paid_at = now()
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

### Flow 5 — Quote Deposit Paid (Stripe Webhook)

```
STRIPE WEBHOOK
→ POST /api/webhooks/stripe?org_id=xxx
→ stripe.webhooks.constructEvent() using organizations.stripe_webhook_secret
  (per-org secret — not platform-wide)
→ Reject if signature invalid
→ Event type: payment_intent.succeeded
→ Metadata identifies quote deposit payment (quote_id, not invoice_id)

BEGIN TRANSACTION
  → SELECT quote row FOR UPDATE by quote_id + org_id
  → UPDATE quotes SET
        deposit_paid_amount = amount_received_cents,
        deposit_paid_at = now(),
        deposit_stripe_payment_intent_id = stripe_payment_intent_id
    WHERE deposit_stripe_payment_intent_id IS NULL
  → INSERT outbox_events (
        event_type:   'quote.deposit_paid',
        idempotency:  'quote.deposit_paid:{quote_id}:{stripe_payment_intent_id}',
        payload:      { quote_id, org_id, contact_id, deposit_paid_amount, deposit_paid_at, stripe_payment_intent_id }
    )
COMMIT

OUTBOX WORKER
→ Claims 'quote.deposit_paid' event
→ Dispatches to queue:notification-dispatch

BULLMQ WORKER
→ INSERTs notifications row (type: 'quote_deposit_paid')

SUPABASE REALTIME
→ Contractor sees "Quote deposit paid" notification
```

---

### Flow 6 — Job Completed → Review Funnel

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
→ Dispatches automation job 'review.send'
  (with delay = automation_settings.review_funnel_delay_hours)

BULLMQ 'review.send' (after delay)
→ Re-reads settings + opt-out
→ INSERT review_requests (status='sent', sent_at=now()) ON CONFLICT (job_id) DO NOTHING
→ INSERT review_events (type='sent')
→ INSERT outbox_events ('review_request.sent')   ─┐
→ Sends review request SMS via Twilio              │
                                                   ▼
OUTBOX WORKER routes 'review_request.sent' to TWO pre-scheduled jobs:
  • 'review.unengaged'  (delay = 72h) — reminder if still status='sent'
  • 'review.expire'     (delay = 14d) — terminal flip to 'expired'

CONTACT OPENS LINK
GET /api/r/:token
→ INSERT review_events (type='link_opened')      [pure telemetry; no state change]

CONTACT SUBMITS RATING
POST /api/r/:token { score, body? }

  ┌─ score ≥ 4 (engaged) ─────────────────────────────────────────────┐
  │ transitionToEngaged() in one transaction:                         │
  │   UPDATE review_requests                                          │
  │     SET status='engaged', submitted_rating=N,                     │
  │         engaged_at=now(), redirected_to_google_at=now()           │
  │     WHERE id=$1 AND status='sent' AND submitted_rating IS NULL    │
  │   INSERT review_events (rating_submitted)                         │
  │   INSERT review_events (redirected_to_google)                     │
  │   Internal conversation note: "Customer rated N★ via review link" │
  │   Internal conversation note: "Customer was redirected to Google" │
  │   INSERT outbox_events ('review_request.engaged')   ──┐           │
  └───────────────────────────────────────────────────────┼───────────┘
                                                          ▼
   OUTBOX routes 'review_request.engaged' to TWO pre-scheduled jobs:
     • 'review.nudge_1' (delay = 24h, fires only if nudge_count=0 → bumps to 1)
     • 'review.nudge_2' (delay = 72h, fires only if nudge_count=1 → bumps to 2)
   Response: { state: 'recorded', google_review_link }
   Client redirects to Google review page.

  ┌─ score ≤ 3 (completed_internal) ──────────────────────────────────┐
  │ transitionToCompletedInternal() in one transaction:               │
  │   UPDATE review_requests SET status='completed_internal',         │
  │     submitted_rating=N, completed_at=now()                        │
  │     WHERE id=$1 AND status='sent' AND submitted_rating IS NULL    │
  │   INSERT review_events (rating_submitted)                         │
  │   Internal conversation note: "Customer rated N★ — left internal  │
  │     feedback"                                                     │
  │   INSERT private_feedback row                                     │
  │   INSERT outbox_events ('private_feedback.received')              │
  └───────────────────────────────────────────────────────────────────┘
   Terminal — no further automation.

ATTRIBUTION (admin-driven, SYNCHRONOUS — no outbox/BullMQ)
POST /api/review-requests/reconcile-count { new_count }           (contractor admin)
POST /api/admin/orgs/[id]/reconcile-review-count { new_count }    (jafar)
→ db.transaction(tx => runAttribution(tx, org_id, new_count))
    Δ = new_count - organizations.last_known_review_count
    if Δ ≤ 0 → just bump baseline + last_review_check_at
    else:
      SELECT … WHERE status='engaged'
                 AND submitted_rating >= 4
                 AND attributed_at IS NULL
                 AND engaged_at >= now() - INTERVAL '72 hours'
        ORDER BY engaged_at DESC LIMIT Δ
      For each candidate, atomic UPDATE → status='likely_reviewed'
        (re-enforces triple guard for race-safety)
        confidence: 0.9 / 0.6 / 0.3
      INSERT review_events (type='attributed') per matched row
      UPDATE organizations SET last_known_review_count, last_review_check_at
```

---

### Lifecycle State Machine

```
                       ┌─────────────┐
job.completed ─────────►  scheduled  │
                       └──────┬──────┘
                              │ review.send fires
                              ▼
                       ┌─────────────┐  72h no engagement
                       │     sent    ├─────────► review.unengaged (one-shot reminder)
                       └──┬───┬──┬───┘
            rating ≥ 4    │   │  │   rating ≤ 3
              ┌───────────┘   │  └───────────┐
              ▼               │              ▼
        ┌──────────┐          │       ┌──────────────────┐
        │ engaged  │          │       │ completed_internal│ (terminal)
        └──┬───┬──┬┘          │       └──────────────────┘
   24h    │   │  │ 72h        │
nudge_1   │   │  │ nudge_2    │
       attribution.engine     │
              ▼               ▼
       ┌──────────────┐   sent_at + 14d
       │ likely_      │   ┌──────────┐
       │  reviewed    │   │ expired  │ (terminal)
       └──────────────┘   └──────────┘
       (terminal)
```

---

## 2. Concurrency Patterns

Race conditions that the system actively guards against. Each has a defined
DB-level solution — never handle these in application logic alone.

---

### Race 1 — Contact Deduplication

**Scenario:** Two inbound leads arrive simultaneously with the same normalised phone.

**Solution:**

```sql
INSERT INTO contacts (org_id, phone, ...)
ON CONFLICT (org_id, phone)
DO NOTHING
RETURNING id;
```

If `RETURNING id` is null → contact already exists.
Fetch by `(org_id, phone)`, link the inbound event to the existing contact.
Emit `contact.duplicate_detected` event.

---

### Race 2 — Job Creation (Opportunity Won twice)

**Scenario:** Two requests simultaneously move the same opportunity to Won stage.

**Solution:** `UNIQUE(opportunity_id)` on `jobs`.

One INSERT succeeds, one fails with unique constraint violation.
The failing transaction rolls back cleanly. No duplicate job, no orphaned outbox event.

---

### Race 3 — Sequential Number Generation

**Scenario:** Two users simultaneously create quotes in the same org.

**Solution:** `SELECT ... FOR UPDATE` on `org_counters` serialises number generation.

```sql
BEGIN;
  SELECT next_quote_number
  FROM org_counters
  WHERE org_id = ?
  FOR UPDATE;

  UPDATE org_counters
  SET next_quote_number = next_quote_number + 1
  WHERE org_id = ?;
  -- assign incremented value to quote
COMMIT;
```

Only one transaction holds the row lock at a time. The other waits.
Both get unique, gap-free sequential numbers.

---

### Race 4 — Payment Webhook Duplicate (Stripe fires twice)

**Scenario:** Stripe fires `payment_intent.succeeded` twice for the same payment.

**Solution:** `UNIQUE(stripe_payment_intent_id)` on `payments`.

Second INSERT fails with unique constraint violation.
Handler catches this specific error, returns 200 OK to Stripe.
Webhook acknowledged — no duplicate payment recorded.

---

### Race 5 — Quote Deposit Webhook Duplicate (Stripe fires twice)

**Scenario:** Stripe fires `payment_intent.succeeded` twice for the same quote deposit.

**Solution:** `UNIQUE(deposit_stripe_payment_intent_id)` on `quotes`.

Second update/insert path must detect the existing intent and return 200 OK to Stripe.
Webhook acknowledged — no duplicate `quote.deposit_paid` event and no double deposit.

---

### Race 6 — Review Request Worker Retry

**Scenario:** BullMQ retries a `review_request` worker — review request already exists.

**Solution:** `UNIQUE(job_id)` on `review_requests`.

Worker checks for existing row before inserting.
If it exists, worker exits cleanly — no duplicate SMS sent.

---

### Race 7 — Notification Batching/Duplicates

**Scenario:** Concurrent events (e.g. multiple team members moving a lead) attempt to create
the same unread notification for a member.

**Solution:** `UNIQUE(member_id, type, resource_id) WHERE read_at IS NULL` on `notifications`.

Blocks duplicate unread rows for the same entity. The worker can then increment
`aggregation_count` on the existing row instead of inserting a new one.

---

## 3. Contact Activity Timeline

The contact detail view shows a unified chronological timeline.
This is NOT a separate table — it is assembled at query time via UNION
across entities, all filtered by `contact_id` and `org_id`.

### Timeline Sources

```
messages          → "SMS received — ..." / "SMS sent — ..."
quotes            → "Quote Q-0042 sent — $4,500" / "Quote accepted"
quote_views       → "Quote Q-0042 viewed"
invoices          → "Invoice INV-0042 sent" / "Invoice paid in full"
payments          → "Payment received — $2,250"
appointments      → "Appointment scheduled — May 15 at 9:00am" / "Completed"
jobs              → "Job created — Roof Replacement" / "Job completed"
review_requests   → "Review request sent"
reviews           → "5-star review received"
private_feedback  → "Negative feedback received"
contact_notes     → "Note by Sarah: Customer prefers contact after 2pm"
automation_jobs   → "Missed call text-back sent"
```

### Pagination

Must use cursor-based pagination — not offset. Offset breaks when new rows
are inserted mid-navigation.

```sql
WHERE (created_at, source_table, id) < (:cursor_ts, :cursor_table, :cursor_id)
ORDER BY created_at DESC, source_table DESC, id DESC
LIMIT 50
```

Compound cursor prevents row loss when multiple events share identical timestamps.
API response must include a `next_cursor` value for the client to request the next page.
