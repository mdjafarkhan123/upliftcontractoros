-- Pipeline gap #1 — stage customization + Won/Lost as deal STATUS (not stages).
-- NOTE: drizzle-kit generated a full-schema diff here because the snapshot baseline
-- was stale (the live DB is far ahead). Verified against the live DB that only the
-- four objects below are actually missing; every other generated statement targeted
-- objects that already exist. Trimmed to the real delta + data backfill.

-- 1. Schema additions
CREATE TYPE "public"."pipeline_status" AS ENUM('open', 'won', 'lost');--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "status" "pipeline_status" DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "can_manage_pipeline" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- 2. Backfill deal status from the legacy is_won/is_lost terminal stages.
UPDATE "opportunities" o
SET "status" = 'won'
FROM "pipeline_stages" ps
WHERE o."stage_id" = ps."id" AND ps."is_won" = true;--> statement-breakpoint
UPDATE "opportunities" o
SET "status" = 'lost'
FROM "pipeline_stages" ps
WHERE o."stage_id" = ps."id" AND ps."is_lost" = true;--> statement-breakpoint

-- 3. Repoint won/lost deals onto each org's last OPEN stage so they keep a valid,
--    meaningful stage_id once the terminal stages are retired (no-op if an org has
--    no open stage — the FK stays valid via the soft-deleted row).
UPDATE "opportunities" o
SET "stage_id" = lo."id"
FROM (
	SELECT DISTINCT ON ("org_id") "org_id", "id"
	FROM "pipeline_stages"
	WHERE "is_won" = false AND "is_lost" = false AND "deleted_at" IS NULL
	ORDER BY "org_id", "position" DESC
) lo
WHERE o."org_id" = lo."org_id"
  AND o."stage_id" IN (SELECT "id" FROM "pipeline_stages" WHERE "is_won" = true OR "is_lost" = true);--> statement-breakpoint

-- 4. Retire the Won/Lost stage rows (soft delete — they are no longer board columns).
UPDATE "pipeline_stages"
SET "deleted_at" = now(), "updated_at" = now()
WHERE ("is_won" = true OR "is_lost" = true) AND "deleted_at" IS NULL;--> statement-breakpoint

-- 5. Grant pipeline management to existing admins (new admin-tier permission).
UPDATE "org_members"
SET "can_manage_pipeline" = true
WHERE "role" = 'admin';
