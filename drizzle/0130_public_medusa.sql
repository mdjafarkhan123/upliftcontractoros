CREATE TYPE "public"."job_form_field_type" AS ENUM('section', 'short_text', 'long_text', 'number', 'checkbox', 'dropdown', 'date', 'photo', 'signature');--> statement-breakpoint
CREATE TABLE "job_form_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"field_type" "job_form_field_type" NOT NULL,
	"label" text NOT NULL,
	"help_text" text,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"position" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_form_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "job_form_fields" ADD CONSTRAINT "job_form_fields_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_form_fields" ADD CONSTRAINT "job_form_fields_template_id_job_form_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."job_form_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_form_templates" ADD CONSTRAINT "job_form_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_form_templates" ADD CONSTRAINT "job_form_templates_created_by_org_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_form_fields_template_idx" ON "job_form_fields" USING btree ("template_id","org_id");--> statement-breakpoint
CREATE INDEX "job_form_templates_org_idx" ON "job_form_templates" USING btree ("org_id");