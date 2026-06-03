# Outbox Worker Reference

Cross-reference: Event System Architecture v1 (authoritative source),
automation-events.md (event catalog + payloads), bullmq-workers.md (worker impl),
event-flows.md (end-to-end business flows).

---

## Table of Contents

1. Three-Layer Architecture
2. Transaction Boundary Law
3. outbox_events Table Schema
4. outbox_events vs automation_jobs
5. Worker Startup & Claim Loop
6. Dispatch Logic & Backoff Schedule
7. pg_notify Trigger
8. Dead-Letter Operations
9. Supabase Realtime Boundaries

---

## 1. Three-Layer Architecture

```
┌────────────────────────────────────────────────────────────┐
│  LAYER 1 — TRANSACTIONAL CORE                              │
│  PostgreSQL + Drizzle                                      │
│                                                            │
│  API route handles request                                 │
│  → BEGIN transaction                                       │
│  → mutate business rows                                    │
│  → INSERT outbox_events row (always last in transaction)   │
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

## 2. Transaction Boundary Law (Rule 28)

This is the single most important operational rule in the system.

### What Goes INSIDE the Database Transaction

```sql
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

### What NEVER Goes Inside a Transaction

```
❌ await bullmq.add(...)           — enqueue job
❌ await twilio.messages.create()  — send SMS
❌ await resend.emails.send()      — send email
❌ supabase.channel().send()       — Realtime publish
❌ fetch('https://...')            — any external HTTP call
```

If the transaction rolls back, external calls cannot be undone. A sent SMS cannot
be unsent. A BullMQ job cannot be un-enqueued. These must only happen after commit,
via the outbox worker.

### Mental Model

```
DB transaction = "declare intent"
Outbox worker  = "execute intent"
```

---

## 3. outbox_events Table Schema

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
sequence            integer — SERIAL auto-increment, ensures ordering within a transaction
available_at        timestamp, default now()
processed_at        timestamp nullable
dead_lettered_at    timestamp nullable
last_error          text nullable
idempotency_key     text UNIQUE
created_at
updated_at
```

Key constraints:

- `idempotency_key` is `UNIQUE` — duplicate event inserts fail gracefully
- `sequence` ordering guarantees multi-event transactions process in correct order
- `available_at > now()` enables delayed processing (review funnel delay, quote follow-up)
- `org_id` is nullable — null for platform-level events only
- Row is **never deleted** — permanent dispatch audit trail

---

## 4. outbox_events vs automation_jobs

These are NOT interchangeable. Both must exist. Neither replaces the other.

| Concern           | `outbox_events`                              | `automation_jobs`                     |
| ----------------- | -------------------------------------------- | ------------------------------------- |
| Responsibility    | Dispatch guarantee (infrastructure)          | Execution audit trail (observability) |
| Question answered | "Did this event get delivered?"              | "What did the automation do?"         |
| Written when      | Inside DB transaction with business mutation | Before BullMQ job is enqueued         |
| Updated by        | Outbox worker                                | BullMQ worker as job progresses       |
| Retry semantics   | Worker retry with dead-letter                | BullMQ built-in retry (max 3)         |
| Contains          | Event payload (JSONB)                        | Resource reference + bull_job_id      |
| Deleted           | Never                                        | Never                                 |

---

## 5. Worker Startup & Claim Loop

### Worker Startup Sequence

```
1. Connect to PostgreSQL
2. LISTEN outbox_channel          ← wake immediately on pg_notify
3. Start 30-second fallback poll  ← catch any missed notifies
4. Begin claim loop
```

### Claim Loop SQL

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

`FOR UPDATE SKIP LOCKED` is non-negotiable. Multiple worker instances can run
concurrently without ever claiming the same row. One instance per row, guaranteed.

---

## 6. Dispatch Logic & Backoff Schedule

### Dispatch Per Claimed Row

```
For each claimed row:

  1. Route to correct BullMQ queue by event_type
     (see bullmq-workers.md for queue name → event_type routing)
  2. Add idempotency_key to BullMQ job options
  3. Enqueue job with payload

  On success:
    UPDATE outbox_events
    SET status = 'processed', processed_at = NOW()

  On failure (attempts < max_attempts):
    UPDATE outbox_events
    SET status = 'pending',
        available_at = NOW() + exponential_backoff(attempts),
        last_error = error_message

  On failure (attempts = max_attempts):
    UPDATE outbox_events
    SET status = 'dead_lettered',
        dead_lettered_at = NOW(),
        last_error = error_message
```

### Exponential Backoff Schedule

```
Attempt 1 failure → retry in 30 seconds
Attempt 2 failure → retry in 5 minutes
Attempt 3 failure → dead_lettered
```

### Event Lifecycle

```
pending → processing → processed    (success path)
                     ↓
                  failed            (attempt < max_attempts — rescheduled via backoff)
                     ↓
               dead_lettered        (attempts = max_attempts — requires manual action)
```

---

## 7. pg_notify Trigger

Fires immediately on `outbox_events` INSERT to wake the worker without polling delay.

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

The 30-second polling interval is the resilience fallback — it catches any events
whose pg_notify was missed (e.g. worker was restarting at the moment of INSERT).

---

## 8. Dead-Letter Operations

When `outbox_events.status = 'dead_lettered'`, the event is surfaced in the
`/jafar` super admin panel. Dead-lettered events must NEVER be silently ignored —
they represent a business operation that failed to complete.

### /jafar Panel Shows

```
→ event_type
→ resource_type + resource_id
→ last_error
→ attempts
→ dead_lettered_at
→ payload (redacted for sensitive fields)
```

### Actions Available

```
→ Manual retry   (resets status to 'pending', clears dead_lettered_at)
→ Dismiss        (acknowledges without retry — records dismissal)
→ Investigate    (links to automation_jobs audit trail)
```

### Index for /jafar Visibility

```sql
CREATE INDEX idx_outbox_events_dead_lettered
  ON outbox_events (org_id, dead_lettered_at)
  WHERE status = 'dead_lettered';
```

### Common Dead-Letter Causes

```
Twilio outage                → retry when service restored
Malformed payload            → requires code fix before retry
Deleted downstream resource  → dismiss (resource no longer exists)
Worker bug                   → requires deploy + retry
Third-party rate limit       → retry with delay
```

---

## 9. Supabase Realtime Boundaries

Supabase Realtime is a UI delivery layer. It is NOT an event bus.
Business-critical automation never depends on Realtime.

**Realtime IS used for:**

- Live in-app notification delivery (notification bell)
- Inbox real-time message updates
- Dashboard live count refreshes
- UI state synchronisation

**Realtime is NEVER used for:**

- Durable automation processing
- Business-critical orchestration
- Retry guarantees
- Replacing `outbox_events`

```
A missed Realtime notification = UX inconvenience (user refreshes, sees it)
A missed outbox event          = business failure (SMS not sent, job not created)
```

If the client is offline when a notification is pushed, they see it on next app
open by querying the `notifications` table directly — Realtime is not the only path.
