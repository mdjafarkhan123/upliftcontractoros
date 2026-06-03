-- Notification push system: per-member preferences, push subscriptions,
-- throttle state, and richer notifications table for batching + push delivery.

-- 1. Add new columns to notifications table
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "push_sent_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "priority" text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "route" text,
  ADD COLUMN IF NOT EXISTS "aggregation_count" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "last_event_at" timestamp with time zone NOT NULL DEFAULT now();

-- 2. Indexes on notifications for preference-aware dispatch queries
CREATE INDEX IF NOT EXISTS "notifications_member_read_created_idx"
  ON "notifications" ("member_id", "read_at", "created_at");

CREATE INDEX IF NOT EXISTS "notifications_member_type_resource_idx"
  ON "notifications" ("member_id", "type", "resource_id");

-- 3. Per-member, per-type notification preferences
-- Absence of a row means defaults apply (both enabled for non-silent types).
CREATE TABLE IF NOT EXISTS "member_notification_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "member_id" uuid NOT NULL REFERENCES "org_members"("id"),
  "notification_type" text NOT NULL,
  "in_app_enabled" boolean NOT NULL DEFAULT true,
  "push_enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "member_notif_pref_unique"
  ON "member_notification_preferences" ("member_id", "notification_type");

-- 4. Web Push subscriptions — one row per device per member
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "member_id" uuid NOT NULL REFERENCES "org_members"("id"),
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_seen_at" timestamp with time zone,
  CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE ("endpoint")
);

CREATE INDEX IF NOT EXISTS "push_subscriptions_member_idx"
  ON "push_subscriptions" ("member_id");

-- 5. Push throttle state — prevents spam for batchable event types
CREATE TABLE IF NOT EXISTS "notification_delivery_state" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "member_id" uuid NOT NULL REFERENCES "org_members"("id"),
  "notification_type" text NOT NULL,
  "resource_id" uuid NOT NULL,
  "last_push_sent_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "notif_delivery_state_unique"
  ON "notification_delivery_state" ("member_id", "notification_type", "resource_id");

CREATE INDEX IF NOT EXISTS "notif_delivery_state_last_push_idx"
  ON "notification_delivery_state" ("last_push_sent_at");
