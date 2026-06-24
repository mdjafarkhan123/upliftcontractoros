ALTER TABLE "organizations" ADD COLUMN "signature_block_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "signature_name" varchar(120);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "signature_title" varchar(120);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "signature_statement" varchar(300);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "signature_image_url" text;