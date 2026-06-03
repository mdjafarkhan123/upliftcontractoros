-- =========================================================================
-- CLEAN FINAL NOTIFICATION SYSTEM MIGRATION
-- Contractor CRM Notification Infrastructure
-- Safe for fresh setup / reset environments
--
-- NOTE: This file mirrors the SQL the user applied directly in the Supabase
-- SQL editor on 2026-05-22. Drizzle schema in src/lib/server/db/schema/10_system.ts
-- intentionally keeps notifications.type / notifications.priority as text — no
-- Postgres enum is created here. Validation lives in NOTIFICATION_TYPES and
-- NOTIFICATION_SPEC (TS) plus Zod at API boundaries.
-- =========================================================================

-- =========================================================================
-- 1. NOTIFICATIONS TABLE ENHANCEMENTS
-- =========================================================================

ALTER TABLE "notifications"
ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "notifications"
ADD COLUMN IF NOT EXISTS "push_sent_at" timestamptz;

ALTER TABLE "notifications"
ADD COLUMN IF NOT EXISTS "priority" text NOT NULL DEFAULT 'normal';

ALTER TABLE "notifications"
ADD COLUMN IF NOT EXISTS "route" text;

ALTER TABLE "notifications"
ADD COLUMN IF NOT EXISTS "aggregation_count" integer NOT NULL DEFAULT 1;

ALTER TABLE "notifications"
ADD COLUMN IF NOT EXISTS "last_event_at" timestamptz NOT NULL DEFAULT now();

-- =========================================================================
-- 2. MEMBER NOTIFICATION PREFERENCES
-- Pure preferences only
-- =========================================================================

CREATE TABLE IF NOT EXISTS "member_notification_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "org_members"("id") ON DELETE CASCADE,
  "notification_type" text NOT NULL,
  "in_app_enabled" boolean NOT NULL DEFAULT true,
  "push_enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS
  "member_notification_preferences_unique_idx"
  ON "member_notification_preferences"
  ("member_id", "notification_type");

-- =========================================================================
-- 3. PUSH SUBSCRIPTIONS
-- One row per browser/device subscription
-- =========================================================================

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "org_members"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL UNIQUE,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz
);

CREATE INDEX IF NOT EXISTS
  "push_subscriptions_member_idx"
  ON "push_subscriptions" ("member_id");

-- =========================================================================
-- 4. DELIVERY THROTTLE STATE
-- Prevents spam push storms
-- =========================================================================

CREATE TABLE IF NOT EXISTS "notification_delivery_state" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "member_id" uuid NOT NULL REFERENCES "org_members"("id") ON DELETE CASCADE,
  "notification_type" text NOT NULL,
  "resource_id" uuid NOT NULL,
  "last_push_sent_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS
  "notification_delivery_state_unique_idx"
  ON "notification_delivery_state"
  ("member_id", "notification_type", "resource_id");

CREATE INDEX IF NOT EXISTS
  "notification_delivery_state_last_push_idx"
  ON "notification_delivery_state"
  ("last_push_sent_at");

-- =========================================================================
-- 5. NOTIFICATION BATCHING RACE CONDITION PROTECTION
-- Prevent duplicate unread rows during concurrent events
-- =========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS
  "notifications_unread_batch_uq"
  ON "notifications"
  ("member_id", "type", "resource_id")
  WHERE "read_at" IS NULL
    AND "resource_id" IS NOT NULL;

-- =========================================================================
-- 6. PERFORMANCE INDEXES
-- =========================================================================

CREATE INDEX IF NOT EXISTS
  "notifications_member_read_created_idx"
  ON "notifications"
  ("member_id", "read_at", "created_at" DESC);

CREATE INDEX IF NOT EXISTS
  "notifications_member_type_resource_idx"
  ON "notifications"
  ("member_id", "type", "resource_id");

-- =========================================================================
-- 7. ENABLE RLS
-- =========================================================================

ALTER TABLE "member_notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_delivery_state" ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 8. MEMBER PREFERENCE POLICIES
-- =========================================================================

DROP POLICY IF EXISTS
  "member_notification_preferences: own rows"
  ON "member_notification_preferences";

CREATE POLICY
  "member_notification_preferences: own rows"
  ON "member_notification_preferences"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    ("member_id" = get_my_member_id())
    AND ("org_id" = get_my_org_id())
  );

-- =========================================================================
-- 9. PUSH SUBSCRIPTION POLICIES
-- =========================================================================

DROP POLICY IF EXISTS
  "push_subscriptions: own rows"
  ON "push_subscriptions";

CREATE POLICY
  "push_subscriptions: own rows"
  ON "push_subscriptions"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    ("member_id" = get_my_member_id())
    AND ("org_id" = get_my_org_id())
  );

DROP POLICY IF EXISTS
  "push_subscriptions: delete own rows"
  ON "push_subscriptions";

CREATE POLICY
  "push_subscriptions: delete own rows"
  ON "push_subscriptions"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ("member_id" = get_my_member_id())
    AND ("org_id" = get_my_org_id())
  );

-- =========================================================================
-- 10. DELIVERY STATE REMAINS INTERNAL ONLY
-- No member-facing policies intentionally
-- Service role / backend only
-- =========================================================================

-- No SELECT/INSERT/UPDATE/DELETE policies added intentionally.
