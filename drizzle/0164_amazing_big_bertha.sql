CREATE TYPE "public"."booking_form_field_key" AS ENUM('first_name', 'last_name', 'company_name', 'email', 'phone', 'address', 'service_details', 'photos', 'lead_source');--> statement-breakpoint
CREATE TYPE "public"."booking_form_field_kind" AS ENUM('standard', 'custom');--> statement-breakpoint
CREATE TABLE "booking_form_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"booking_link_id" uuid NOT NULL,
	"kind" "booking_form_field_kind" DEFAULT 'standard' NOT NULL,
	"standard_key" "booking_form_field_key",
	"question_type" text,
	"label" text,
	"help_text" text,
	"placeholder" text,
	"options" jsonb,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"page" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_field_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"booking_field_id" uuid,
	"question_label" text NOT NULL,
	"question_type" text NOT NULL,
	"value_text" text,
	"value_json" jsonb,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_form_fields" ADD CONSTRAINT "booking_form_fields_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_form_fields" ADD CONSTRAINT "booking_form_fields_booking_link_id_booking_links_id_fk" FOREIGN KEY ("booking_link_id") REFERENCES "public"."booking_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_field_answers" ADD CONSTRAINT "request_field_answers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_field_answers" ADD CONSTRAINT "request_field_answers_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_booking_form_fields_link" ON "booking_form_fields" USING btree ("booking_link_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_booking_form_fields_standard_key" ON "booking_form_fields" USING btree ("booking_link_id","standard_key") WHERE "booking_form_fields"."standard_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_request_field_answers_request" ON "request_field_answers" USING btree ("request_id");--> statement-breakpoint

-- Seed the default standardized fields for any EXISTING request forms so the
-- builder has rows to manage. New forms are seeded by the create endpoint. The
-- defaults reproduce the pre-R5.2 hardcoded wizard exactly (all shown, address
-- required; name/phone/details locked-required). Booking forms get nothing.
INSERT INTO "booking_form_fields"
	("org_id", "booking_link_id", "kind", "standard_key", "is_enabled", "is_required", "is_locked", "position")
SELECT bl."org_id", bl."id", 'standard', d.key::"booking_form_field_key", d.enabled, d.required, d.locked, d.pos
FROM "booking_links" bl
CROSS JOIN (VALUES
	('first_name',      true, true,  true,  0),
	('last_name',       true, true,  true,  1),
	('company_name',    true, false, false, 2),
	('email',           true, false, false, 3),
	('phone',           true, true,  true,  4),
	('address',         true, true,  false, 5),
	('service_details', true, true,  true,  6),
	('photos',          true, false, false, 7),
	('lead_source',     true, false, false, 8)
) AS d(key, enabled, required, locked, pos)
WHERE bl."form_type" = 'request' AND bl."deleted_at" IS NULL;--> statement-breakpoint

-- Tenant isolation (Rule 12). Writes happen via service-role through /api/*
-- routes; these policies gate client-side reads to the caller's own org.
ALTER TABLE "booking_form_fields" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "booking_form_fields: members select own org rows"
  ON "booking_form_fields"
  AS PERMISSIVE FOR SELECT TO "authenticated"
  USING (("org_id" = get_my_org_id()));--> statement-breakpoint

ALTER TABLE "request_field_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "request_field_answers: members select own org rows"
  ON "request_field_answers"
  AS PERMISSIVE FOR SELECT TO "authenticated"
  USING (("org_id" = get_my_org_id()));