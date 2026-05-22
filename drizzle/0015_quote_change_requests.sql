-- Add new quote status value
ALTER TYPE "public"."quote_status" ADD VALUE IF NOT EXISTS 'changes_requested';

-- Operational log of customer change requests
CREATE TABLE IF NOT EXISTS "quote_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"quote_id" uuid NOT NULL REFERENCES "quotes"("id") ON DELETE CASCADE,
	"message" text NOT NULL,
	"requested_at" timestamptz NOT NULL DEFAULT now(),
	"resolved_at" timestamptz,
	"created_at" timestamptz NOT NULL DEFAULT now()
);

-- Enforce at most one unresolved change request per quote
CREATE UNIQUE INDEX IF NOT EXISTS "idx_quote_change_requests_one_active"
	ON "quote_change_requests" ("quote_id")
	WHERE "resolved_at" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_quote_change_requests_quote_id"
	ON "quote_change_requests" ("quote_id");

CREATE INDEX IF NOT EXISTS "idx_quote_change_requests_org_id"
	ON "quote_change_requests" ("org_id");

-- RLS: contractor JWT may SELECT own org rows; writes go via service role
ALTER TABLE "public"."quote_change_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."quote_change_requests" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_change_requests: members select own org requests"
	ON "public"."quote_change_requests";

CREATE POLICY "quote_change_requests: members select own org requests"
	ON "public"."quote_change_requests"
	FOR SELECT
	TO authenticated
	USING (org_id = public.get_my_org_id());
