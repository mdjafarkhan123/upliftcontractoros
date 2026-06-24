ALTER TABLE "email_domains" ADD COLUMN "forward_test_token" text;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "forward_test_email" text;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "forward_test_status" text;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "forward_test_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "forward_test_verified_at" timestamp with time zone;