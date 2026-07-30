ALTER TYPE "public"."media_purpose_tag" ADD VALUE 'invoice_signature' BEFORE 'request_photo';--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "signature_name" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "signature_media_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "signed_at" timestamp with time zone;