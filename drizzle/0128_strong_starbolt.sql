CREATE TABLE "job_time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"org_member_id" uuid NOT NULL,
	"clock_in" timestamp with time zone NOT NULL,
	"clock_out" timestamp with time zone,
	"duration_minutes" numeric(10, 2),
	"hourly_rate_snapshot" numeric(12, 2),
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "hourly_cost_rate" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "job_time_entries" ADD CONSTRAINT "job_time_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_time_entries" ADD CONSTRAINT "job_time_entries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_time_entries" ADD CONSTRAINT "job_time_entries_org_member_id_org_members_id_fk" FOREIGN KEY ("org_member_id") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_time_entries" ADD CONSTRAINT "job_time_entries_created_by_org_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_time_entries_job_idx" ON "job_time_entries" USING btree ("job_id","org_id");--> statement-breakpoint
CREATE INDEX "job_time_entries_member_idx" ON "job_time_entries" USING btree ("org_member_id","org_id");