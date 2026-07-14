ALTER TABLE "invoices" ADD COLUMN "tip_total" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "tips_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "tip_preset_percents" jsonb DEFAULT '[10,15,20]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "tip_amount" numeric(12, 2) DEFAULT '0' NOT NULL;