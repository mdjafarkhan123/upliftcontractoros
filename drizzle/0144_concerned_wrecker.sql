ALTER TYPE "public"."media_purpose_tag" ADD VALUE 'quote_signature';--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "acceptance_signature_media_id" uuid;