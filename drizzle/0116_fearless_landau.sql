ALTER TYPE "public"."media_purpose_tag" ADD VALUE 'quote_line_item_photo';--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "line_key" uuid;--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD COLUMN "line_key" uuid DEFAULT gen_random_uuid() NOT NULL;