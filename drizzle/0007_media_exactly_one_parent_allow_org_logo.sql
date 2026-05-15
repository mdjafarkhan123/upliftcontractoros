ALTER TABLE "media" ALTER COLUMN "sha256_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_exactly_one_parent";--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_must_have_parent";--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_exactly_one_parent" CHECK ((
			(
				"media"."purpose_tag" = 'org_logo'
				AND "media"."job_id" IS NULL
				AND "media"."quote_id" IS NULL
				AND "media"."invoice_id" IS NULL
			)
			OR (
				"media"."purpose_tag" <> 'org_logo'
				AND (
					("media"."job_id" IS NOT NULL)::int +
					("media"."quote_id" IS NOT NULL)::int +
					("media"."invoice_id" IS NOT NULL)::int = 1
				)
			)
		));
