CREATE TYPE "public"."communication_consent_status" AS ENUM('unknown', 'opted_in', 'opted_out', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."communication_preference_category" AS ENUM('all', 'manual_message', 'marketing', 'speed_to_lead', 'quote_send', 'quote_followup', 'invoice_send', 'invoice_reminder', 'appointment_confirmation', 'appointment_reminder', 'job_scheduled', 'job_on_my_way', 'payment_receipt', 'review_request', 'private_feedback_recovery');--> statement-breakpoint
CREATE TYPE "public"."communication_preference_channel" AS ENUM('all', 'sms', 'email', 'call', 'whatsapp', 'messenger', 'gbp', 'webchat');--> statement-breakpoint
CREATE TYPE "public"."communication_preference_direction" AS ENUM('all', 'inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."communication_preference_source" AS ENUM('customer', 'user', 'workflow', 'provider', 'system', 'migration');--> statement-breakpoint
CREATE TYPE "public"."communication_preference_status" AS ENUM('allowed', 'blocked', 'permanent');--> statement-breakpoint
CREATE TABLE "contact_communication_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" "communication_preference_channel" NOT NULL,
	"category" "communication_preference_category" NOT NULL,
	"status" "communication_consent_status" NOT NULL,
	"source" "communication_preference_source" NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consented_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_communication_preference_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"preference_id" uuid,
	"channel" "communication_preference_channel" NOT NULL,
	"direction" "communication_preference_direction" NOT NULL,
	"category" "communication_preference_category" NOT NULL,
	"previous_status" "communication_preference_status",
	"next_status" "communication_preference_status" NOT NULL,
	"source" "communication_preference_source" NOT NULL,
	"reason_code" text,
	"reason_message" text,
	"actor_member_id" uuid,
	"provider" text,
	"provider_event_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_communication_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" "communication_preference_channel" NOT NULL,
	"direction" "communication_preference_direction" NOT NULL,
	"category" "communication_preference_category" NOT NULL,
	"status" "communication_preference_status" NOT NULL,
	"source" "communication_preference_source" NOT NULL,
	"reason_code" text,
	"reason_message" text,
	"actor_member_id" uuid,
	"provider" text,
	"provider_event_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_communication_consents" ADD CONSTRAINT "contact_communication_consents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_communication_consents" ADD CONSTRAINT "contact_communication_consents_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_communication_preference_events" ADD CONSTRAINT "contact_communication_preference_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_communication_preference_events" ADD CONSTRAINT "contact_communication_preference_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_communication_preference_events" ADD CONSTRAINT "contact_communication_preference_events_preference_id_contact_communication_preferences_id_fk" FOREIGN KEY ("preference_id") REFERENCES "public"."contact_communication_preferences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_communication_preference_events" ADD CONSTRAINT "contact_communication_preference_events_actor_member_id_org_members_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_communication_preferences" ADD CONSTRAINT "contact_communication_preferences_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_communication_preferences" ADD CONSTRAINT "contact_communication_preferences_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_communication_preferences" ADD CONSTRAINT "contact_communication_preferences_actor_member_id_org_members_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_comm_consents_scope_uq" ON "contact_communication_consents" USING btree ("org_id","contact_id","channel","category");--> statement-breakpoint
CREATE INDEX "contact_comm_consents_contact_idx" ON "contact_communication_consents" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "contact_comm_pref_events_contact_idx" ON "contact_communication_preference_events" USING btree ("org_id","contact_id","created_at");--> statement-breakpoint
CREATE INDEX "contact_comm_pref_events_scope_idx" ON "contact_communication_preference_events" USING btree ("org_id","contact_id","channel","direction","category");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_comm_prefs_scope_uq" ON "contact_communication_preferences" USING btree ("org_id","contact_id","channel","direction","category");--> statement-breakpoint
CREATE INDEX "contact_comm_prefs_contact_idx" ON "contact_communication_preferences" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "contact_comm_prefs_eval_idx" ON "contact_communication_preferences" USING btree ("org_id","contact_id","channel","direction","category","status");
--> statement-breakpoint
INSERT INTO "contact_communication_preferences" (
	"org_id",
	"contact_id",
	"channel",
	"direction",
	"category",
	"status",
	"source",
	"reason_code",
	"reason_message",
	"effective_from",
	"created_at",
	"updated_at"
)
SELECT
	c."org_id",
	c."id",
	'all'::"communication_preference_channel",
	'all'::"communication_preference_direction",
	'all'::"communication_preference_category",
	'blocked'::"communication_preference_status",
	'migration'::"communication_preference_source",
	'LEGACY_DO_NOT_CONTACT',
	'Backfilled from contacts.do_not_contact.',
	COALESCE(c."do_not_contact_at", c."updated_at", c."created_at", now()),
	now(),
	now()
FROM "contacts" c
WHERE c."do_not_contact" = true
ON CONFLICT ("org_id", "contact_id", "channel", "direction", "category") DO NOTHING;
--> statement-breakpoint
INSERT INTO "contact_communication_preferences" (
	"org_id",
	"contact_id",
	"channel",
	"direction",
	"category",
	"status",
	"source",
	"reason_code",
	"reason_message",
	"effective_from",
	"created_at",
	"updated_at"
)
SELECT
	c."org_id",
	c."id",
	'sms'::"communication_preference_channel",
	'outbound'::"communication_preference_direction",
	'all'::"communication_preference_category",
	'permanent'::"communication_preference_status",
	'migration'::"communication_preference_source",
	COALESCE(NULLIF(c."sms_opt_out_source", ''), 'LEGACY_SMS_OPT_OUT'),
	'Backfilled from contacts.sms_opt_out.',
	COALESCE(c."sms_opt_out_at", c."updated_at", c."created_at", now()),
	now(),
	now()
FROM "contacts" c
WHERE c."sms_opt_out" = true
ON CONFLICT ("org_id", "contact_id", "channel", "direction", "category") DO NOTHING;
--> statement-breakpoint
INSERT INTO "contact_communication_preferences" (
	"org_id",
	"contact_id",
	"channel",
	"direction",
	"category",
	"status",
	"source",
	"reason_code",
	"reason_message",
	"effective_from",
	"created_at",
	"updated_at"
)
SELECT
	c."org_id",
	c."id",
	'all'::"communication_preference_channel",
	'outbound'::"communication_preference_direction",
	'review_request'::"communication_preference_category",
	'blocked'::"communication_preference_status",
	'migration'::"communication_preference_source",
	'LEGACY_REVIEW_REQUEST_OPT_OUT',
	'Backfilled from contacts.receives_review_requests = false.',
	COALESCE(c."updated_at", c."created_at", now()),
	now(),
	now()
FROM "contacts" c
WHERE c."receives_review_requests" = false
ON CONFLICT ("org_id", "contact_id", "channel", "direction", "category") DO NOTHING;
--> statement-breakpoint
INSERT INTO "contact_communication_preference_events" (
	"org_id",
	"contact_id",
	"preference_id",
	"channel",
	"direction",
	"category",
	"previous_status",
	"next_status",
	"source",
	"reason_code",
	"reason_message",
	"metadata",
	"created_at"
)
SELECT
	p."org_id",
	p."contact_id",
	p."id",
	p."channel",
	p."direction",
	p."category",
	NULL,
	p."status",
	p."source",
	p."reason_code",
	p."reason_message",
	jsonb_build_object('backfill', true),
	now()
FROM "contact_communication_preferences" p
WHERE p."source" = 'migration'::"communication_preference_source";
--> statement-breakpoint
INSERT INTO "contact_communication_consents" (
	"org_id",
	"contact_id",
	"channel",
	"category",
	"status",
	"source",
	"evidence",
	"revoked_at",
	"created_at",
	"updated_at"
)
SELECT
	c."org_id",
	c."id",
	'sms'::"communication_preference_channel",
	'all'::"communication_preference_category",
	'revoked'::"communication_consent_status",
	'migration'::"communication_preference_source",
	jsonb_build_object('legacy_field', 'sms_opt_out', 'legacy_source', c."sms_opt_out_source"),
	COALESCE(c."sms_opt_out_at", c."updated_at", c."created_at", now()),
	now(),
	now()
FROM "contacts" c
WHERE c."sms_opt_out" = true
ON CONFLICT ("org_id", "contact_id", "channel", "category") DO NOTHING;
--> statement-breakpoint
INSERT INTO "contact_communication_consents" (
	"org_id",
	"contact_id",
	"channel",
	"category",
	"status",
	"source",
	"evidence",
	"consented_at",
	"created_at",
	"updated_at"
)
SELECT
	c."org_id",
	c."id",
	'email'::"communication_preference_channel",
	'marketing'::"communication_preference_category",
	'opted_in'::"communication_consent_status",
	'migration'::"communication_preference_source",
	jsonb_build_object('legacy_field', 'email_opt_in'),
	COALESCE(c."updated_at", c."created_at", now()),
	now(),
	now()
FROM "contacts" c
WHERE c."email_opt_in" = true
ON CONFLICT ("org_id", "contact_id", "channel", "category") DO NOTHING;
