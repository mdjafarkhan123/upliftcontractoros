-- Contact attachments: let a contractor attach a PDF, photo, or document
-- directly to a contact record (no parent job/quote/invoice required).
--
-- 1. New purpose tag for the media bucket.
-- 2. New contact_id parent FK on media.
-- 3. Extend the "exactly one parent" CHECK to count contact_id as a valid
--    sole parent for non-org_logo rows. The constraint references only
--    column-nullness and 'org_logo' — it does NOT reference the new
--    'contact_attachment' value, so combining the ADD VALUE with the
--    constraint rewrite in one migration is safe on PG 12+.
-- 4. Partial index for the contact-files lookup.

ALTER TYPE "public"."media_purpose_tag" ADD VALUE IF NOT EXISTS 'contact_attachment';--> statement-breakpoint

ALTER TABLE "media"
  ADD COLUMN IF NOT EXISTS "contact_id" uuid REFERENCES "contacts"("id");--> statement-breakpoint

ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_exactly_one_parent";--> statement-breakpoint

ALTER TABLE "media" ADD CONSTRAINT "media_exactly_one_parent" CHECK ((
			(
				"media"."purpose_tag" = 'org_logo'
				AND "media"."contact_id" IS NULL
				AND "media"."job_id" IS NULL
				AND "media"."quote_id" IS NULL
				AND "media"."invoice_id" IS NULL
				AND "media"."message_id" IS NULL
			)
			OR (
				"media"."purpose_tag" <> 'org_logo'
				AND (
					("media"."contact_id" IS NOT NULL)::int +
					("media"."job_id" IS NOT NULL)::int +
					("media"."quote_id" IS NOT NULL)::int +
					("media"."invoice_id" IS NOT NULL)::int +
					("media"."message_id" IS NOT NULL)::int = 1
				)
			)
		));--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_media_contact"
  ON "media" ("contact_id") WHERE "contact_id" IS NOT NULL;
