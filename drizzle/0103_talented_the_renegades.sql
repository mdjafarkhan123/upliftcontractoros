ALTER TABLE "quotes" ADD COLUMN "acceptance_signature_name" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "acceptance_signature_ip" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "acceptance_signed_at" timestamp with time zone;