CREATE TYPE "public"."job_invoice_reminder_status" AS ENUM('active', 'completed');--> statement-breakpoint
CREATE TABLE "job_invoice_reminder_assignees" (
	"reminder_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_invoice_reminder_assignees_reminder_id_member_id_pk" PRIMARY KEY("reminder_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "job_invoice_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"assigned_to" uuid,
	"description" text,
	"scheduled_start" timestamp with time zone,
	"scheduled_end" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"status" "job_invoice_reminder_status" DEFAULT 'active' NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"notify_team_on_assign" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_invoice_reminder_assignees" ADD CONSTRAINT "job_invoice_reminder_assignees_reminder_id_job_invoice_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."job_invoice_reminders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_invoice_reminder_assignees" ADD CONSTRAINT "job_invoice_reminder_assignees_member_id_org_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_invoice_reminder_assignees" ADD CONSTRAINT "job_invoice_reminder_assignees_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_invoice_reminders" ADD CONSTRAINT "job_invoice_reminders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_invoice_reminders" ADD CONSTRAINT "job_invoice_reminders_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_invoice_reminders" ADD CONSTRAINT "job_invoice_reminders_assigned_to_org_members_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_invoice_reminders" ADD CONSTRAINT "job_invoice_reminders_completed_by_org_members_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_invoice_reminders" ADD CONSTRAINT "job_invoice_reminders_created_by_org_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_reminder_assignees_member_org" ON "job_invoice_reminder_assignees" USING btree ("member_id","org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_reminder_assignees_one_lead" ON "job_invoice_reminder_assignees" USING btree ("reminder_id") WHERE is_lead = true;--> statement-breakpoint
CREATE INDEX "idx_job_invoice_reminders_job" ON "job_invoice_reminders" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_job_invoice_reminders_org_due" ON "job_invoice_reminders" USING btree ("org_id","status","scheduled_start");