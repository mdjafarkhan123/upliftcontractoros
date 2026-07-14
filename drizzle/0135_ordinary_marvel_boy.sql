CREATE TYPE "public"."job_custom_field_type" AS ENUM('short_text', 'number', 'date', 'dropdown', 'checkbox', 'link');--> statement-breakpoint
CREATE TABLE "job_custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"value_text" text,
	"value_number" numeric(14, 4),
	"value_bool" boolean,
	"value_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_custom_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"field_type" "job_custom_field_type" NOT NULL,
	"label" text NOT NULL,
	"help_text" text,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"position" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "job_custom_field_values" ADD CONSTRAINT "job_custom_field_values_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_custom_field_values" ADD CONSTRAINT "job_custom_field_values_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_custom_field_values" ADD CONSTRAINT "job_custom_field_values_field_id_job_custom_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."job_custom_fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_custom_fields" ADD CONSTRAINT "job_custom_fields_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_custom_fields" ADD CONSTRAINT "job_custom_fields_created_by_org_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_custom_field_values_job_idx" ON "job_custom_field_values" USING btree ("job_id","org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_custom_field_values_job_field_uq" ON "job_custom_field_values" USING btree ("job_id","field_id");--> statement-breakpoint
CREATE INDEX "job_custom_fields_org_idx" ON "job_custom_fields" USING btree ("org_id");