CREATE TYPE "public"."job_form_submission_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TABLE "job_form_submission_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"source_field_id" uuid,
	"field_type" "job_form_field_type" NOT NULL,
	"label" text NOT NULL,
	"help_text" text,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"position" numeric(10, 2) DEFAULT '0' NOT NULL,
	"value_text" text,
	"value_number" numeric(14, 4),
	"value_bool" boolean,
	"value_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"template_id" uuid,
	"template_name" text NOT NULL,
	"status" "job_form_submission_status" DEFAULT 'in_progress' NOT NULL,
	"submitted_at" timestamp with time zone,
	"submitted_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "job_form_submission_fields" ADD CONSTRAINT "job_form_submission_fields_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_form_submission_fields" ADD CONSTRAINT "job_form_submission_fields_submission_id_job_form_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."job_form_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_form_submissions" ADD CONSTRAINT "job_form_submissions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_form_submissions" ADD CONSTRAINT "job_form_submissions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_form_submissions" ADD CONSTRAINT "job_form_submissions_template_id_job_form_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."job_form_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_form_submissions" ADD CONSTRAINT "job_form_submissions_submitted_by_org_members_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_form_submissions" ADD CONSTRAINT "job_form_submissions_created_by_org_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_form_submission_fields_submission_idx" ON "job_form_submission_fields" USING btree ("submission_id","org_id");--> statement-breakpoint
CREATE INDEX "job_form_submissions_job_idx" ON "job_form_submissions" USING btree ("job_id","org_id");