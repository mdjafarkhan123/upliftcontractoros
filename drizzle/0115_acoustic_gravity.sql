ALTER TYPE "public"."media_purpose_tag" ADD VALUE 'opportunity_attachment';--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_exactly_one_parent";--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "opportunity_id" uuid;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_media_opportunity" ON "media" USING btree ("opportunity_id") WHERE "media"."opportunity_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_exactly_one_parent" CHECK ((
			(
				"media"."purpose_tag"::text IN ('org_logo', 'org_signature')
				AND "media"."contact_id" IS NULL
				AND "media"."opportunity_id" IS NULL
				AND "media"."job_id" IS NULL
				AND "media"."quote_id" IS NULL
				AND "media"."invoice_id" IS NULL
				AND "media"."message_id" IS NULL
			)
			OR (
				"media"."purpose_tag"::text NOT IN ('org_logo', 'org_signature')
				AND (
					("media"."contact_id" IS NOT NULL)::int +
					("media"."opportunity_id" IS NOT NULL)::int +
					("media"."job_id" IS NOT NULL)::int +
					("media"."quote_id" IS NOT NULL)::int +
					("media"."invoice_id" IS NOT NULL)::int +
					("media"."message_id" IS NOT NULL)::int = 1
				)
			)
		));