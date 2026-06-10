-- Contractor-submitted email domain setup/change requests (Stage 2 of the email
-- identity plan). PO holds all contractor DNS, so domain changes are request-to-PO,
-- never self-service. This table is the durable record; the PO is notified by system
-- email via the `email_domain.change_requested` outbox event. Purely ADDITIVE.

DO $$ BEGIN
	CREATE TYPE "email_change_request_type" AS ENUM ('new_domain', 'change_domain');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "email_change_request_status" AS ENUM ('pending', 'in_review', 'completed', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
	"requested_by_member_id" uuid NOT NULL REFERENCES "org_members"("id"),
	"request_type" "email_change_request_type" NOT NULL,
	"desired_domain" text NOT NULL,
	"desired_local_part" text,
	"note" text,
	"status" "email_change_request_status" DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_change_requests_org_id_created_idx" ON "email_change_requests" ("org_id", "created_at");
