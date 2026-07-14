ALTER TABLE "organizations" ADD COLUMN "default_quote_terms" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "terms" text;