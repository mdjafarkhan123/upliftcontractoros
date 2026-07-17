CREATE TYPE "public"."request_approval_state" AS ENUM('not_required', 'pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."request_source" AS ENUM('internal', 'public_form');--> statement-breakpoint
ALTER TYPE "public"."media_purpose_tag" ADD VALUE 'request_photo';--> statement-breakpoint
CREATE TABLE "request_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"line_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"description" text NOT NULL,
	"details" text,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit" varchar(50),
	"unit_price" numeric(12, 2) NOT NULL,
	"unit_cost" numeric(12, 2),
	"taxable" boolean DEFAULT true NOT NULL,
	"source_catalog_item_id" uuid,
	"total" numeric(12, 2) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"title" text NOT NULL,
	"service_details" text,
	"lead_source_answer" text,
	"source" "request_source" DEFAULT 'internal' NOT NULL,
	"booking_link_id" uuid,
	"approval_state" "request_approval_state" DEFAULT 'not_required' NOT NULL,
	"approval_decided_at" timestamp with time zone,
	"approval_decided_by" uuid,
	"converted_to_quote_id" uuid,
	"converted_to_job_id" uuid,
	"converted_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"notes" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_exactly_one_parent";--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "request_line_items" ADD CONSTRAINT "request_line_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_line_items" ADD CONSTRAINT "request_line_items_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_line_items" ADD CONSTRAINT "request_line_items_source_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("source_catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_approval_decided_by_org_members_id_fk" FOREIGN KEY ("approval_decided_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_converted_to_quote_id_quotes_id_fk" FOREIGN KEY ("converted_to_quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_converted_to_job_id_jobs_id_fk" FOREIGN KEY ("converted_to_job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_created_by_org_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_request_line_items_request_id" ON "request_line_items" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_requests_org_created" ON "requests" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_requests_contact" ON "requests" USING btree ("contact_id","org_id");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_appointments_live_assessment" ON "appointments" USING btree ("request_id") WHERE request_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_exactly_one_parent" CHECK ((
			(
				"media"."purpose_tag"::text IN ('org_logo', 'org_signature', 'catalog_item_photo')
				AND "media"."contact_id" IS NULL
				AND "media"."opportunity_id" IS NULL
				AND "media"."job_id" IS NULL
				AND "media"."quote_id" IS NULL
				AND "media"."invoice_id" IS NULL
				AND "media"."message_id" IS NULL
				AND "media"."request_id" IS NULL
			)
			OR (
				"media"."purpose_tag"::text NOT IN ('org_logo', 'org_signature', 'catalog_item_photo')
				AND (
					("media"."contact_id" IS NOT NULL)::int +
					("media"."opportunity_id" IS NOT NULL)::int +
					("media"."job_id" IS NOT NULL)::int +
					("media"."quote_id" IS NOT NULL)::int +
					("media"."invoice_id" IS NOT NULL)::int +
					("media"."message_id" IS NOT NULL)::int +
					("media"."request_id" IS NOT NULL)::int = 1
				)
			)
		));--> statement-breakpoint

-- Tenant isolation (Rule 12). Writes happen via service-role through /api/*
-- routes; these policies gate client-side reads to the caller's own org.
ALTER TABLE "requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "requests: members select own org rows"
  ON "requests"
  AS PERMISSIVE FOR SELECT TO "authenticated"
  USING (("org_id" = get_my_org_id()));--> statement-breakpoint

ALTER TABLE "request_line_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "request_line_items: members select own org rows"
  ON "request_line_items"
  AS PERMISSIVE FOR SELECT TO "authenticated"
  USING (("org_id" = get_my_org_id()));
