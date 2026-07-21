# Domain 5 — Communication

Tables: `conversations`, `messages`, `inbound_communication_events`
Enums used: `message_channel`, `conversation_status`, `message_direction`,
`message_status`

> The legacy `conversation_channel` enum has been removed. Channel now lives only
> on `messages`. Conversations are transport-agnostic operational threads.

---

## `conversations`

Unified communication thread with a contact. Transport-agnostic — channel is
derived from messages. The app layer chooses how aggressively to thread; the
database does **not** enforce one-open-conversation-per-contact (multiple open
threads are allowed for future project separation).

```sql
CREATE TABLE conversations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID NOT NULL REFERENCES organizations (id),
  contact_id                UUID NOT NULL REFERENCES contacts (id),
  status                    conversation_status NOT NULL DEFAULT 'open',
  subject                   TEXT,                                       -- Nullable.
  reply_alias               TEXT,                                       -- Opaque token (e.g. 'r_<12 chars>') for inbound email routing.
  assigned_to               UUID REFERENCES org_members (id),

  -- Activity / inbox metadata (denormalized — set by writers; reconcilable from messages)
  last_message_at           TIMESTAMPTZ,
  last_message_preview      TEXT,                                       -- ≤140 chars; "Missed phone call" for missed_call channel.
  last_message_channel      message_channel,                            -- Channel of the last non-internal-note message.
  last_message_direction    message_direction,                          -- Direction of the last non-internal-note message.
  last_inbound_at           TIMESTAMPTZ,
  last_outbound_at          TIMESTAMPTZ,
  last_inbound_email_at     TIMESTAMPTZ,
  last_outbound_email_at    TIMESTAMPTZ,
  first_response_at         TIMESTAMPTZ,                                -- First outbound following an inbound. Set once, never overwritten.
  unread_count              INTEGER NOT NULL DEFAULT 0,
  tags                      TEXT[] NOT NULL DEFAULT '{}',

  -- Snooze
  snoozed_until             TIMESTAMPTZ,
  snoozed_by                UUID REFERENCES org_members (id),

  -- Close
  closed_at                 TIMESTAMPTZ,
  closed_by                 UUID REFERENCES org_members (id),
  closed_reason             TEXT,                                       -- e.g. 'webchat_expired', 'manual', custom note.

  deleted_at                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
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

-- Email routing — alias uniqueness scoped to org
CREATE UNIQUE INDEX idx_conversations_org_reply_alias
  ON conversations (org_id, reply_alias)
  WHERE reply_alias IS NOT NULL;

-- Snooze sweep (unsnooze cron — every 5 min)
CREATE INDEX idx_conversations_snoozed_until
  ON conversations (snoozed_until)
  WHERE status = 'snoozed' AND snoozed_until IS NOT NULL;

-- Email inbox ordering
CREATE INDEX idx_conversations_last_inbound_email
  ON conversations (org_id, last_inbound_email_at DESC)
  WHERE last_inbound_email_at IS NOT NULL;
```

**Operational metadata writer contract:**

Every message insert MUST be followed (in the same transaction) by a call to
`touchConversationOnMessage()` in `$lib/server/conversations/`:

- Internal notes update `last_message_at` only.
- Real messages update `last_message_at`, `last_message_preview`,
  `last_message_channel`, `last_message_direction`.
- Inbound: bumps `last_inbound_at`, `unread_count` (+1), and
  `last_inbound_email_at` when the channel is email.
- Outbound: sets `last_outbound_at`, `last_outbound_email_at` when email, and
  sets `first_response_at` once if `last_inbound_at` was already present.

**Notes:**

- `reply_alias`: opaque random tokens only (`r_<12 chars>`). Never embed internal IDs.
- `unread_count` is denormalized. Reconcilable from
  `messages WHERE direction = 'inbound' AND read_at IS NULL`.
- The DB does NOT enforce one-open-conversation-per-contact. The app layer's
  threading rules decide. Multiple open conversations for the same contact are
  legal — e.g. one per project, or per channel where deliberately separated.
- Snooze cron (`unsnoozeConversations`) flips `snoozed → open` when
  `snoozed_until <= now()`.

---

## `messages`

Individual messages within a conversation — inbound or outbound. Channel is the
transport-of-record for that single message.

```sql
CREATE TABLE messages (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                       UUID NOT NULL REFERENCES organizations (id),
  conversation_id              UUID NOT NULL REFERENCES conversations (id),
  direction                    message_direction NOT NULL,
  channel                      message_channel NOT NULL,                -- sms | missed_call | email | webchat
  body                         TEXT,
  is_internal_note             BOOLEAN NOT NULL DEFAULT FALSE,
  media_urls                   TEXT[],                                  -- @deprecated. Use media table with message_id.
  status                       message_status NOT NULL,
  twilio_message_sid           TEXT,

  -- Threading & delivery metadata
  reply_to_message_id          UUID REFERENCES messages (id),
  failure_reason               TEXT,
  failed_at                    TIMESTAMPTZ,
  source                       TEXT,                                    -- 'api' | 'webhook' | 'automation' | 'webchat'

  -- Email transport
  email_provider               TEXT,
  email_provider_message_id    TEXT,
  email_subject                TEXT,
  email_from_address           TEXT,
  email_to_addresses           TEXT[],
  email_cc_addresses           TEXT[],
  email_in_reply_to            TEXT,
  email_references             TEXT,
  opened_at                    TIMESTAMPTZ,
  delivered_at                 TIMESTAMPTZ,
  bounced_at                   TIMESTAMPTZ,
  bounce_type                  TEXT,                                    -- 'hard' | 'soft' | NULL

  sent_by                      UUID REFERENCES org_members (id),
  sent_at                      TIMESTAMPTZ,
  read_at                      TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
-- Twilio idempotency
CREATE UNIQUE INDEX idx_messages_twilio_sid
  ON messages (twilio_message_sid)
  WHERE twilio_message_sid IS NOT NULL;

-- Email webhook dedup
CREATE INDEX idx_messages_email_provider_lookup
  ON messages (org_id, email_provider, email_provider_message_id)
  WHERE email_provider_message_id IS NOT NULL;

CREATE INDEX idx_messages_conversation_id ON messages (conversation_id);
CREATE INDEX idx_messages_org_id ON messages (org_id);
CREATE INDEX idx_messages_direction_read
  ON messages (conversation_id, direction, read_at);
```

**Notes:**

- No `deleted_at`. Messages are immutable communication records.
- **Internal notes** are represented by the `is_internal_note` boolean, NOT a
  channel value. They inherit the conversation's most recent channel for
  storage continuity but never affect inbox preview/unread state.
- **Missed calls** are stored as messages with `channel = 'missed_call'`,
  `direction = 'inbound'`, `status = 'received'`, `body = 'Missed phone call'`,
  `twilio_message_sid = <CallSid>`. They update conversation operational
  metadata identically to other inbound messages.
- **Inbound email routing priority**:
  1. Match `reply_alias` from inbound `To:` address.
  2. Match `email_in_reply_to` header (RFC 2822 Message-ID).
  3. Fallback to contact lookup by `email_from_address`.
- `sent_by` is NULL for inbound messages and automation-sent messages.
- `media_urls` is deprecated. All new media (any channel, including email
  attachments) writes through the `media` table with `message_id` populated.

---

## `inbound_communication_events`

Raw audit log of inbound communication webhooks (Twilio SMS, Twilio voice,
Resend email, webchat). NOT part of the outbox system — purely for auditing,
debugging, and replay diagnostics.

```sql
CREATE TABLE inbound_communication_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations (id),
  provider            TEXT NOT NULL,        -- 'twilio' | 'resend' | 'webchat'
  provider_event_id   TEXT,                 -- SID, Message-ID, or message id
  event_type          TEXT NOT NULL,        -- 'sms' | 'missed_call' | 'email' | 'webchat'
  raw_payload         JSONB NOT NULL,
  processed_at        TIMESTAMPTZ,
  error               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**

```sql
CREATE INDEX idx_inbound_comm_org_provider
  ON inbound_communication_events (org_id, provider);

CREATE INDEX idx_inbound_comm_provider_event
  ON inbound_communication_events (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
```

**Notes:**

- Written best-effort (`void db.insert(...).catch(...)`) — never blocks the
  webhook response.
- Has RLS enabled. Select policy: org members of the same `org_id`. Not
  surfaced in the contractor UI by default — this is operator/diagnostic data.
- No `deleted_at`. Append-only.
