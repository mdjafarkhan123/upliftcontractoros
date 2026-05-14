# Domain 5 — Communication

Tables: `conversations`, `messages`
Enums used: `conversation_channel`, `message_channel`, `conversation_status`,
`message_direction`, `message_status`

---

## `conversations`

Unified communication thread with a contact. One open conversation per contact per
channel — enforced at database level.

```sql
CREATE TABLE conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations (id),
  contact_id       UUID NOT NULL REFERENCES contacts (id),
  channel          conversation_channel NOT NULL,
  status           conversation_status NOT NULL DEFAULT 'open',
  subject          TEXT,                          -- Nullable. Intended for future email threads.
  assigned_to      UUID REFERENCES org_members (id),  -- Nullable. Member scoped access anchor.
  last_message_at  TIMESTAMPTZ,                       -- Denormalized. Updated on every message.
  unread_count     INTEGER NOT NULL DEFAULT 0,        -- Denormalized. Reconcilable if drift detected.
  tags             TEXT[] NOT NULL DEFAULT '{}',
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_conversations_org_id ON conversations (org_id);
CREATE INDEX idx_conversations_contact_id ON conversations (contact_id);
CREATE INDEX idx_conversations_assigned_to ON conversations (assigned_to);
CREATE INDEX idx_conversations_status ON conversations (org_id, status);
CREATE INDEX idx_conversations_last_message_at
  ON conversations (org_id, last_message_at DESC);

-- Only one open conversation per contact per channel.
CREATE UNIQUE INDEX idx_conversations_open_contact_channel
  ON conversations (contact_id, channel)
  WHERE deleted_at IS NULL AND status = 'open';
```

**Notes:**

- `unread_count` is denormalized. If drift detected, reconcile by counting `messages WHERE direction = 'inbound' AND read_at IS NULL` for the conversation. Never trust for permission or financial logic.

---

## `messages`

Individual messages within a conversation — inbound or outbound.

```sql
CREATE TABLE messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations (id),
  conversation_id       UUID NOT NULL REFERENCES conversations (id),
  direction             message_direction NOT NULL,
  channel               message_channel NOT NULL,
  body                  TEXT,                           -- Nullable for missed call entries.
  is_internal_note      BOOLEAN NOT NULL DEFAULT FALSE,
  media_urls            TEXT[],
  status                message_status NOT NULL,
  twilio_message_sid    TEXT,                           -- Nullable for non-Twilio messages.
  sent_by               UUID REFERENCES org_members (id),  -- Null for automation-sent messages.
  sent_at               TIMESTAMPTZ,
  read_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
-- Twilio idempotency. Prevents duplicate webhook processing.
CREATE UNIQUE INDEX idx_messages_twilio_sid
  ON messages (twilio_message_sid)
  WHERE twilio_message_sid IS NOT NULL;

CREATE INDEX idx_messages_conversation_id ON messages (conversation_id);
CREATE INDEX idx_messages_org_id ON messages (org_id);
CREATE INDEX idx_messages_direction_read
  ON messages (conversation_id, direction, read_at);
```

**Notes:**

- No `deleted_at`. Messages are immutable communication records.
- `twilio_message_sid` uniqueness is a partial index (null excluded). Prevents duplicate Twilio webhook processing.
- `queued` and `bounced` status values reserved for future email channel. No v1 logic uses them.
- `body` is nullable — missed call channel entries have no message body.
- `sent_by` is NULL for automation-sent messages (BullMQ workers).
