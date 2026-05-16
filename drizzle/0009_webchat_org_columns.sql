-- Migration 1: Add feature_webchat flag and widget_token to organizations
ALTER TABLE "organizations" ADD COLUMN "feature_webchat" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "widget_token" uuid NOT NULL DEFAULT gen_random_uuid();--> statement-breakpoint

-- Backfill widget_token for any orgs that may have gotten null (safety — DEFAULT handles new rows)
UPDATE "organizations" SET "widget_token" = gen_random_uuid() WHERE "widget_token" IS NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "idx_organizations_widget_token" ON "organizations" ("widget_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_organizations_feature_webchat" ON "organizations" ("feature_webchat") WHERE "feature_webchat" = TRUE;
