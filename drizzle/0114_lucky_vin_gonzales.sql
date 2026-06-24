ALTER TYPE "public"."media_purpose_tag" ADD VALUE 'org_signature';--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_exactly_one_parent";--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_exactly_one_parent" CHECK ((
			(
				"media"."purpose_tag"::text IN ('org_logo', 'org_signature')
				AND "media"."contact_id" IS NULL
				AND "media"."job_id" IS NULL
				AND "media"."quote_id" IS NULL
				AND "media"."invoice_id" IS NULL
				AND "media"."message_id" IS NULL
			)
			OR (
				"media"."purpose_tag"::text NOT IN ('org_logo', 'org_signature')
				AND (
					("media"."contact_id" IS NOT NULL)::int +
					("media"."job_id" IS NOT NULL)::int +
					("media"."quote_id" IS NOT NULL)::int +
					("media"."invoice_id" IS NOT NULL)::int +
					("media"."message_id" IS NOT NULL)::int = 1
				)
			)
		));