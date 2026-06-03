# Domain 3 — Pipeline

Tables: `pipeline_stages`, `opportunities`
Enums used: none (references `contact_status` lifecycle indirectly)

---

## `pipeline_stages`

Configurable pipeline stages per org. Partial unique indexes enforce business rules
on special stages (default, won, lost).

```sql
CREATE TABLE pipeline_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations (id),
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,                    -- Hex color code. e.g. '#3B82F6'
  position    INTEGER NOT NULL,                 -- Display order. App manages re-ordering.
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,   -- Starting stage for new opportunities.
  is_won      BOOLEAN NOT NULL DEFAULT FALSE,   -- Won terminal stage. Triggers job creation.
  is_lost     BOOLEAN NOT NULL DEFAULT FALSE,   -- Lost terminal stage.
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
-- Each org can only have ONE of each special stage type (active only).
CREATE UNIQUE INDEX idx_pipeline_stages_one_won
  ON pipeline_stages (org_id)
  WHERE is_won = TRUE AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_pipeline_stages_one_lost
  ON pipeline_stages (org_id)
  WHERE is_lost = TRUE AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_pipeline_stages_one_default
  ON pipeline_stages (org_id)
  WHERE is_default = TRUE AND deleted_at IS NULL;

-- Unique position per org among active stages.
CREATE UNIQUE INDEX idx_pipeline_stages_position
  ON pipeline_stages (org_id, position)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_pipeline_stages_org_id
  ON pipeline_stages (org_id);
```

**Notes:**

- A stage cannot be soft-deleted while live opportunities (`deleted_at IS NULL`) reference it. Enforced at API layer.
- `is_won`, `is_lost`, `is_default` are mutually exclusive on a single row. Enforced at application layer.
- Stage positions must remain unique per org. Reordering is transactional.

---

## `opportunities`

A deal or potential job moving through the pipeline. The commercial record of intent
before a job is created.

```sql
CREATE TABLE opportunities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations (id),
  contact_id    UUID NOT NULL REFERENCES contacts (id),
  stage_id      UUID NOT NULL REFERENCES pipeline_stages (id),
  title         TEXT NOT NULL,
  value         NUMERIC(12,2),                  -- Estimated deal value. Nullable — may be unknown.
  assigned_to   UUID REFERENCES org_members (id),  -- Nullable. Preserved on member deactivation.
  lost_reason   TEXT,                           -- Populated when moved to Lost stage.
  closed_at     TIMESTAMPTZ,                    -- Set when moved to Won or Lost stage.
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_opportunities_org_id ON opportunities (org_id);
CREATE INDEX idx_opportunities_contact_id ON opportunities (contact_id);
CREATE INDEX idx_opportunities_stage_id ON opportunities (stage_id);
CREATE INDEX idx_opportunities_assigned_to ON opportunities (assigned_to);
```

---

## Pipeline events

Outbox-routed business events emitted by `/api/pipeline/opportunities/*`.
See `automation-events.md` for payload schemas; see `outbox-worker.md` for
how routing + activity persistence works.

| Event                          | Producer                                       | Routing                          |
| ------------------------------ | ---------------------------------------------- | -------------------------------- |
| `opportunity.created`          | POST opportunities; public booking webhook     | notification + activity feed     |
| `opportunity.assignee_changed` | PATCH opportunities (only when assignee diffs) | notification (new assignee only) |
| `opportunity.stage_changed`    | PATCH opportunities/[id]/stage (every move)    | activity feed only               |
| `opportunity.won`              | Stage move into `is_won` stage                 | notification + activity feed     |
| `opportunity.lost`             | Stage move into `is_lost` stage                | notification + activity feed     |
| `contact.status_changed`       | Side-effect of `opportunity.won` (Flow 2)      | activity feed only               |
| `job.created`                  | Side-effect of `opportunity.won` (Flow 2)      | notification + activity feed     |

> **Deprecated:** the legacy `opportunity.updated` event was a catch-all
> "PATCH happened" notice. It is no longer emitted — title/value edits fire
> no event, and assignee changes have their own granular event. Activity
> persistence and notifications are driven only by the events listed above.

**Idempotency keys** (see `automation-events.md` §3):

- `opportunity.created` / `won` / `lost`: `{event}:{opp_id}` — exactly-once per lifecycle transition.
- `opportunity.stage_changed`: `opportunity.stage_changed:{move_request_id}` — client-supplied UUID protects against double-click replays.
- `opportunity.assignee_changed`: `opportunity.assignee_changed:{opp_id}:{new_assigned_to|"null"}` — same assignee swap is a no-op; new assignee fires fresh notification.
- `contact.status_changed`: `contact.status_changed:{contact_id}:{opp_id}` — scoped per triggering opportunity.

**Notification recipients** (handled in `notificationWorker`):

- `opportunity.created`: assignee if set, else admin/manager fallback.
- `opportunity.assignee_changed`: new assignee only; self-assignment is silent.
- `opportunity.lost`: assignee if set, else admin/manager.
- `opportunity.stage_changed`, `contact.status_changed`: no notification — feed-only.
