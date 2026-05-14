# Domain 4 — Jobs

Tables: `jobs`
Enums used: `job_status`

---

## `jobs`

Operational delivery entity. Always created from a Won opportunity — never independently.
Service address is a point-in-time snapshot — historically immutable after creation.

```sql
CREATE TABLE jobs (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID NOT NULL REFERENCES organizations (id),
  opportunity_id            UUID NOT NULL REFERENCES opportunities (id),
  contact_id                UUID NOT NULL REFERENCES contacts (id),
  title                     TEXT NOT NULL,
  status                    job_status NOT NULL DEFAULT 'scheduled',
  assigned_to               UUID REFERENCES org_members (id),   -- Nullable. Preserved on deactivation.
  notes                     TEXT,
  scope_of_work             TEXT,

  -- Service address snapshot. Copied at job creation. Never updated after.
  -- Nullable: handles edge case where contact has no address at job creation time.
  service_address_line_1    TEXT,
  service_address_line_2    TEXT,
  service_address_city      TEXT,
  service_address_state     TEXT,
  service_address_zip       TEXT,

  scheduled_start           TIMESTAMPTZ,
  scheduled_end             TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  cancelled_at              TIMESTAMPTZ,
  deleted_at                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
-- Structural idempotency guard: one job per opportunity, ever.
CREATE UNIQUE INDEX idx_jobs_opportunity_id
  ON jobs (opportunity_id);

CREATE INDEX idx_jobs_org_id ON jobs (org_id);
CREATE INDEX idx_jobs_contact_id ON jobs (contact_id);
CREATE INDEX idx_jobs_assigned_to ON jobs (assigned_to);
CREATE INDEX idx_jobs_status ON jobs (org_id, status);
CREATE INDEX idx_jobs_scheduled_start ON jobs (org_id, scheduled_start);
```

**Notes:**

- `UNIQUE(opportunity_id)` is a hard structural constraint — NOT a partial index. Duplicate job creation from concurrent Won transitions, webhook retries, and automation replays is structurally impossible.
- Service address fields are nullable for the case where a contact has no address at job creation. Nulls here are a data quality issue, not a schema violation.
- `scheduled_start` / `scheduled_end` represent the planned window. Appointments linked via `job_id` handle visit-level scheduling.
