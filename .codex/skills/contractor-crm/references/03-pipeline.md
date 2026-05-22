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
