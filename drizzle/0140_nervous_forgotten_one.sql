ALTER TABLE "quotes" ADD COLUMN "public_token" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_public_token_unique" UNIQUE("public_token");
