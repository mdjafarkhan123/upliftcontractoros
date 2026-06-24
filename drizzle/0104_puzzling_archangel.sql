ALTER TABLE "quotes" ADD COLUMN "deposit_type" text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "deposit_percent" numeric(5, 2);