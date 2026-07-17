# Domain 3 — Pipeline

Tables: `pipeline_stages`, `opportunities`
Enums used: `pipeline_status` (`'open' | 'won' | 'lost'`)

> **Model: "pure status" (Pipedrive/GHL).** Won and Lost are a **status on the
> deal**, NOT pipeline stages/columns. The board shows only `status = 'open'`
> deals; staff close a deal via Mark Won / Mark Lost actions, not by dragging it
> into a terminal column. The legacy Won/Lost `pipeline_stages` rows are
> soft-deleted by migration `0070` and are never shown or configurable in
> settings. The `is_won` / `is_lost` boolean columns still exist on
> `pipeline_stages` (not dropped), but they are **no longer the source of truth
> for closed state** — `opportunities.status` is. Treat them as legacy.

---

## `pipeline_stages`

Configurable, org-owned pipeline stages — the **open** stages a deal moves
through. Fully customizable by members with `can_manage_pipeline` (see
"Stage management API" below). Partial unique indexes enforce one default
stage and unique positions per org.

```sql
CREATE TABLE pipeline_stages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations (id),
  name              TEXT NOT NULL,                   -- Unique per org, case-insensitive (API-enforced).
  color             TEXT NOT NULL,                   -- Hex color, e.g. '#3B82F6'.
  position          INTEGER NOT NULL,                -- Display order. App manages re-ordering.
  is_default        BOOLEAN NOT NULL DEFAULT FALSE,  -- Starting stage for new opportunities.
  is_won            BOOLEAN NOT NULL DEFAULT FALSE,  -- LEGACY. Won/Lost stage rows are soft-deleted; status is authoritative.
  is_lost           BOOLEAN NOT NULL DEFAULT FALSE,  -- LEGACY. See note at top.
  description       TEXT,                            -- Optional. Shows as subtitle/tooltip on the board.
  stale_after_days  INTEGER,                         -- Nullable. Deal older than this in-stage shows an aging chip. 1–365.
  probability       INTEGER,                         -- Nullable. Win likelihood % (0–100). Feeds the forecast KPI.
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
-- Each org has exactly ONE default stage (active only).
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

> Legacy `idx_pipeline_stages_one_won` / `idx_pipeline_stages_one_lost` partial
> unique indexes may still exist on older DBs but are inert under the pure-status
> model (no active Won/Lost rows). Do not rely on them.

**Notes:**

- A stage may not be soft-deleted while open opportunities reference it unless
  the caller passes `?move_to=` to relocate them. Enforced at the API layer
  (see DELETE below).
- Exactly one `is_default = TRUE` per org among active stages. Set-default is a
  transactional swap (unset others → set this).
- Positions must remain unique per org. Reordering is transactional and
  validated as an exact permutation of the org's live stages.
- Seed provisions **5 open stages only** (no Won/Lost rows), each with a
  `description`, `probability`, and `stale_after_days`.

---

## `opportunities`

A deal or potential job moving through the pipeline. The commercial record of
intent before a job is created.

```sql
CREATE TABLE opportunities (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES organizations (id),
  contact_id           UUID NOT NULL REFERENCES contacts (id),
  stage_id             UUID NOT NULL REFERENCES pipeline_stages (id),
  title                TEXT NOT NULL,
  value                NUMERIC(12,2),                 -- Estimated deal value. Nullable — may be unknown.
  status               pipeline_status NOT NULL DEFAULT 'open',  -- 'open' | 'won' | 'lost'. Source of truth for closed state.
  assigned_to          UUID REFERENCES org_members (id),  -- Nullable. Preserved on member deactivation.
  lost_reason          TEXT,                          -- Populated when status → 'lost'.
  closed_at            TIMESTAMPTZ,                   -- Set when status → 'won' or 'lost'.
  stage_entered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),  -- Reset on every stage move. Drives aging chips.
  expected_close_date  DATE,                          -- Nullable. Forecast / expected-close filters.
  next_follow_up_at    TIMESTAMPTZ,                   -- Nullable. Per-deal follow-up reminder; cron sweep fires opportunity.follow_up_due when due, then clears it. Actionable task, NOT a forecast (distinct from expected_close_date).
  deleted_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_opportunities_org_id ON opportunities (org_id);
CREATE INDEX idx_opportunities_contact_id ON opportunities (contact_id);
CREATE INDEX idx_opportunities_stage_id ON opportunities (stage_id);
CREATE INDEX idx_opportunities_assigned_to ON opportunities (assigned_to);
```

**Notes:**

- A Won deal **keeps its `stage_id`** — it does not move to a terminal stage.
  Closed state is read entirely from `status`.
- The board GET defaults to `status = 'open'`; `?status=all` returns full
  history. `stage_entered_at` is reset to `now()` on every open→open move.

---

## Permission gating

Pipeline capabilities are gated by booleans on `org_members` (Rule #7 —
`checkPermission()`, never `role`):

| Permission                        | Gates                                                               |
| --------------------------------- | ------------------------------------------------------------------- |
| `can_view_full_pipeline`          | See every deal + stage totals (All scope).                          |
| `can_view_assigned_opportunities` | See only own assigned deals (Mine scope).                           |
| `can_move_pipeline_stages`        | Drag between stages **and** Mark Won / Mark Lost (status endpoint). |
| `can_create_opportunities`        | Create new deals.                                                   |
| `can_manage_pipeline`             | Add/rename/reorder/recolor/configure **stages** (settings page).    |

`can_manage_pipeline` backfills `true` for existing admins (migration `0070`);
admin templates grant it via `fullAdminPermissions()`, manager/member templates
default it `false`. It surfaces automatically in both permission editors
(`PermissionEditor.svelte`, `PermissionMatrixEditor.svelte`) because they render
from `PERMISSION_GROUPS`.

---

## Stage management API

All gated on `can_manage_pipeline`. Rule #14 shapes (`{ data }` /
`{ error, field_errors? }`). Config changes, not business events — **no outbox**.

| Route                                       | Behavior                                                                                                                                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET  /api/pipeline/stages`                 | Active stages (incl. `description`, `probability`, `stale_after_days`). No `is_won`/`is_lost` in select.                                                                                                                                           |
| `POST /api/pipeline/stages`                 | Create an open stage. Case-insensitive name uniqueness per org. `position = max+1`; `is_default/won/lost = false`.                                                                                                                                 |
| `PATCH /api/pipeline/stages/[id]`           | Edit name/color/description/probability/stale. Rename dupe check excludes self. `is_default = true` does the transactional default swap.                                                                                                           |
| `DELETE /api/pipeline/stages/[id]`          | 422 if it's the last stage. Counts **open** deals; requires a valid, different `?move_to=` when count > 0 (moves them, resets `stage_entered_at`). Reassigns default if needed. Soft-deletes. Returns `{ data: { moved, new_default_stage_id } }`. |
| `PATCH /api/pipeline/stages/reorder`        | `{ stage_ids }` must be an exact permutation of live stages (409 if stale). Sequential `position = i+1` in a tx. 204.                                                                                                                              |
| `GET  /api/pipeline/stages/[id]/deal-count` | Lazy open-deal count for a stage (so the delete dialog can show the count up-front without bloating the board GET).                                                                                                                                |

Zod (`src/lib/server/pipeline/schemas.ts`): hex color regex, name ≤ 60,
description ≤ 200 (→ null), probability 0–100, stale 1–365.

---

## Terminal status API

`PATCH /api/pipeline/opportunities/[id]/status` — the Mark Won / Mark Lost
endpoint. Gated on `can_move_pipeline_stages`. Only an **open** deal can
transition (else 409); reopening is not supported in v1.

- **Won** (`{ status: 'won', request_id }`): in one tx — set `status='won'` +
  `closed_at`, create the `job` (snapshotting the contact's primary service
  address), set `contacts.status='customer'`, and emit **three** outbox events:
  `opportunity.won`, `job.created`, `contact.status_changed`. The deal's
  `stage_id` is unchanged, so **no `opportunity.stage_changed` is emitted**.
  Duplicate Won (UNIQUE on `jobs.opportunity_id`) is idempotent.
- **Lost** (`{ status: 'lost', request_id, lost_reason }`): set `status='lost'`
  - `closed_at` + `lost_reason`, emit `opportunity.lost`. `lost_reason` is
    required (Zod refine).

`PATCH /api/pipeline/opportunities/[id]/stage` is now **open→open moves only**
(guards `status='open'`); it no longer carries won/lost branches or
`lost_reason`.

---

## Pipeline events

Outbox-routed business events emitted by `/api/pipeline/opportunities/*`.
See `automation-events.md` for payload schemas; see `outbox-worker.md` for
how routing + activity persistence works.

| Event                          | Producer                                                                                                              | Routing                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `opportunity.created`          | POST opportunities; public booking webhook; **`pipeline_auto_create`** (inbound lead, Stage 3.a)                      | notification + activity feed     |
| `opportunity.assignee_changed` | PATCH opportunities (only when assignee diffs)                                                                        | notification (new assignee only) |
| `opportunity.stage_changed`    | PATCH opportunities/[id]/stage (every open→open move); **`pipeline_auto_advance`** (first two-way contact, Stage 3.a) | activity feed only               |
| `opportunity.won`              | PATCH opportunities/[id]/status (status → won)                                                                        | notification + activity feed     |
| `opportunity.lost`             | PATCH opportunities/[id]/status (status → lost)                                                                       | notification + activity feed     |
| `opportunity.follow_up_due`    | cron `opportunity-follow-up-due-sweep` (next_follow_up_at due)                                                        | notification only                |
| `contact.status_changed`       | Side-effect of `opportunity.won` (Flow 2)                                                                             | activity feed only               |
| `job.created`                  | Side-effect of `opportunity.won` (Flow 2)                                                                             | notification + activity feed     |

> **Producer change (pure-status model):** `opportunity.won` / `opportunity.lost`
> are now produced by the **status endpoint**, not by a stage move into an
> `is_won`/`is_lost` stage. Won does **not** co-emit `opportunity.stage_changed`
> (the stage is unchanged) — so the Won batch is 3 events, not 4.

> **Deprecated:** the legacy `opportunity.updated` event was a catch-all
> "PATCH happened" notice. It is no longer emitted — title/value edits fire
> no event, and assignee changes have their own granular event. Activity
> persistence and notifications are driven only by the events listed above.

**Idempotency keys** (see `automation-events.md` §3):

- `opportunity.created` / `won` / `lost`: `{event}:{opp_id}` — exactly-once per lifecycle transition.
- `opportunity.stage_changed`: `opportunity.stage_changed:{move_request_id}` — client-supplied UUID protects against double-click replays.
- `opportunity.assignee_changed`: `opportunity.assignee_changed:{opp_id}:{new_assigned_to|"null"}` — same assignee swap is a no-op; new assignee fires fresh notification.
- `contact.status_changed`: `contact.status_changed:{contact_id}:{opp_id}` — scoped per triggering opportunity.
- `opportunity.follow_up_due`: outbox `opportunity.follow_up_due:{opp_id}:{due_at ISO}`; per-recipient notification key appends `:{member_id}`. Cron clears `next_follow_up_at` in the emitting tx → fires once per due instant.

**Notification recipients** (handled in `notificationWorker`):

- `opportunity.created`: assignee if set, else admin/manager fallback.
- `opportunity.assignee_changed`: new assignee only; self-assignment is silent.
- `opportunity.lost`: assignee if set, else admin/manager.
- `opportunity.follow_up_due`: assignee if set, else admin/manager fallback (unassigned deals are still reminded — see Flow 2c). Deep-links `/pipeline?deal={id}`.
- `opportunity.stage_changed`, `contact.status_changed`: no notification — feed-only.
