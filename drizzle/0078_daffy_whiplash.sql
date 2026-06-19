CREATE TYPE "public"."contact_import_on_duplicate" AS ENUM('skip', 'update');--> statement-breakpoint
ALTER TABLE "contact_imports" ADD COLUMN "on_duplicate" "contact_import_on_duplicate" DEFAULT 'skip' NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_imports" ADD COLUMN "updated" integer DEFAULT 0 NOT NULL;