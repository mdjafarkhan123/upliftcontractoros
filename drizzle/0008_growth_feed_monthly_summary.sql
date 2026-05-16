ALTER TABLE "growth_feed_items" ADD COLUMN "summary_month" integer;--> statement-breakpoint
ALTER TABLE "growth_feed_items" ADD COLUMN "summary_year" integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_growth_feed_monthly_summary_unique"
	ON "growth_feed_items" ("org_id", "summary_year", "summary_month")
	WHERE "is_monthly_summary" = TRUE;
