ALTER TABLE "automation_sequence_steps" ADD COLUMN "audience" text DEFAULT 'contact' NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_sequence_steps" ADD COLUMN "condition" text;