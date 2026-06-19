CREATE TYPE "public"."automation_enrollment_status" AS ENUM('active', 'paused', 'stopped', 'completed');--> statement-breakpoint
CREATE TYPE "public"."automation_step_channel" AS ENUM('sms_first', 'email_first', 'both', 'sms_only', 'email_only');--> statement-breakpoint
CREATE TABLE "automation_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sequence_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"status" "automation_enrollment_status" DEFAULT 'active' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"next_step_at" timestamp with time zone,
	"bull_job_id" text,
	"pause_reason" text,
	"paused_until" timestamp with time zone,
	"stop_reason" text,
	"last_step_sent_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_sequence_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sequence_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"channel" "automation_step_channel",
	"sms_body" text,
	"email_subject" text,
	"email_body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"channel" "automation_step_channel" DEFAULT 'sms_first' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_enrollments" ADD CONSTRAINT "automation_enrollments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_enrollments" ADD CONSTRAINT "automation_enrollments_sequence_id_automation_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."automation_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_enrollments" ADD CONSTRAINT "automation_enrollments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_sequence_steps" ADD CONSTRAINT "automation_sequence_steps_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_sequence_steps" ADD CONSTRAINT "automation_sequence_steps_sequence_id_automation_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."automation_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_sequences" ADD CONSTRAINT "automation_sequences_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_enrollments_active_uq" ON "automation_enrollments" USING btree ("sequence_id","contact_id") WHERE "automation_enrollments"."status" IN ('active', 'paused');--> statement-breakpoint
CREATE INDEX "automation_enrollments_org_contact_status_idx" ON "automation_enrollments" USING btree ("org_id","contact_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_sequence_steps_seq_position_uq" ON "automation_sequence_steps" USING btree ("sequence_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_sequences_org_key_uq" ON "automation_sequences" USING btree ("org_id","key");--> statement-breakpoint
-- Seed: one speed_to_lead sequence per org, carried over from existing automation_settings.
INSERT INTO "automation_sequences" ("org_id", "key", "enabled", "channel")
SELECT
	s."org_id",
	'speed_to_lead',
	s."speed_to_lead_enabled",
	(CASE s."speed_to_lead_channel"
		WHEN 'smart' THEN 'sms_first'
		WHEN 'sms' THEN 'sms_only'
		WHEN 'email' THEN 'email_only'
		WHEN 'both' THEN 'both'
		ELSE 'sms_first'
	END)::"automation_step_channel"
FROM "automation_settings" s
ON CONFLICT ("org_id", "key") DO NOTHING;--> statement-breakpoint
-- Seed step 0 (instant reply) from the org's existing speed_to_lead_* templates.
INSERT INTO "automation_sequence_steps" ("org_id", "sequence_id", "position", "delay_minutes", "channel", "sms_body", "email_subject", "email_body")
SELECT seq."org_id", seq."id", 0, 0, NULL, s."speed_to_lead_message", s."speed_to_lead_email_subject", s."speed_to_lead_email_message"
FROM "automation_sequences" seq
JOIN "automation_settings" s ON s."org_id" = seq."org_id"
WHERE seq."key" = 'speed_to_lead'
ON CONFLICT ("sequence_id", "position") DO NOTHING;--> statement-breakpoint
-- Seed default follow-up steps (PLAN.md Card 1). Editable later in the 3.d config UI.
INSERT INTO "automation_sequence_steps" ("org_id", "sequence_id", "position", "delay_minutes", "channel", "sms_body", "email_subject", "email_body")
SELECT seq."org_id", seq."id", v.position, v.delay_minutes, v.channel::"automation_step_channel", v.sms_body, v.email_subject, v.email_body
FROM "automation_sequences" seq
CROSS JOIN (VALUES
	(1, 60, 'sms_first', 'Still there {contact_name}? Reply YES and we''ll call you right back.', 'Following up on your request', E'Hi {contact_name},\n\nJust checking in on your request — we''d love to help. Reply here or call us and we''ll get right back to you.\n\n- {org_name}'),
	(2, 240, 'sms_first', 'Hi {contact_name}, here''s how we can help with your project. When works for a quick call?', 'How we can help', E'Hi {contact_name},\n\nWe wanted to follow up and see how we can help. Just reply with a good time and we''ll reach out.\n\n- {org_name}'),
	(3, 1440, 'email_first', 'Last follow-up {contact_name} — are you still interested? We''re here whenever you''re ready.', 'Checking in one last time', E'Hi {contact_name},\n\nThis is our last note for now — if you''re still interested we''d be glad to help. Reply anytime and we''ll pick things right back up.\n\n- {org_name}')
) AS v(position, delay_minutes, channel, sms_body, email_subject, email_body)
WHERE seq."key" = 'speed_to_lead'
ON CONFLICT ("sequence_id", "position") DO NOTHING;