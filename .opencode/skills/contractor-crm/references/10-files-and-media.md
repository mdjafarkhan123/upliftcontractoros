# Domain 10 — Files & Media

Tables: `media`
Enums used: `media_purpose_tag`, `media_type`

---

## `media`

All org media — job photos, attachments, marketing assets. Stores metadata only.
Actual files live in Cloudflare R2 Storage.

```sql
CREATE TABLE media (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations (id),
  uploaded_by         UUID REFERENCES org_members (id),
  job_id              UUID REFERENCES jobs (id),
  quote_id            UUID REFERENCES quotes (id),
  invoice_id          UUID REFERENCES invoices (id),
  message_id          UUID REFERENCES messages (id) ON DELETE CASCADE,
  r2_key              TEXT NOT NULL,
  thumbnail_key       TEXT,
  web_key             TEXT,
  original_filename   TEXT NOT NULL,
  file_size_bytes     INTEGER NOT NULL,
  media_type          media_type NOT NULL,
  mime_type           TEXT NOT NULL,
  purpose_tag         media_purpose_tag NOT NULL,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- At least one parent FK must be populated,
  -- unless it is a standalone asset (logo, avatar, marketing asset).
  CONSTRAINT media_must_have_parent CHECK (
    job_id IS NOT NULL
    OR quote_id IS NOT NULL
    OR invoice_id IS NOT NULL
    OR message_id IS NOT NULL
    OR purpose_tag IN ('org_logo', 'avatar', 'marketing_asset')
  )
);
```

**Indexes:**

```sql
CREATE INDEX idx_media_org_id ON media (org_id);
CREATE INDEX idx_media_job ON media (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_media_quote ON media (quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX idx_media_invoice ON media (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_media_message ON media (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX idx_media_uploaded_by ON media (uploaded_by);
CREATE INDEX idx_media_purpose_tag ON media (org_id, purpose_tag);
```

**Notes:**

- On upload: Sharp processes server-side → three R2 objects created (original, thumbnail, web) → one `media` row inserted with all three keys.
- `purpose_tag = 'quote_attachment'` requires `quote_id` to be set.
- `purpose_tag = 'invoice_attachment'` requires `invoice_id` to be set.
- `purpose_tag = 'email_attachment'` requires `message_id` to be set.
- `purpose_tag = 'marketing_asset'` makes the file available to agency for GBP and social content.
- CHECK constraint enforces at least one parent FK (`job_id`, `quote_id`, `invoice_id`, `message_id`), except for standalone assets (`org_logo`, `avatar`, `marketing_asset`).
- On soft-delete: R2 objects deleted by post-commit side effect via outbox worker. Schema row retained for audit.
