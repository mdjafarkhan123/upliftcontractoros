CREATE TYPE "public"."communication_workflow_action" AS ENUM('dnd_contact');--> statement-breakpoint
CREATE TYPE "public"."communication_workflow_status" AS ENUM('draft', 'published', 'paused');--> statement-breakpoint
CREATE TYPE "public"."communication_workflow_trigger" AS ENUM('contact_dnd');--> statement-breakpoint
CREATE TABLE "communication_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "communication_workflow_status" DEFAULT 'draft' NOT NULL,
	"trigger" "communication_workflow_trigger" NOT NULL,
	"trigger_filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action" "communication_workflow_action" NOT NULL,
	"action_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communication_workflows" ADD CONSTRAINT "communication_workflows_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "communication_workflows_org_status_idx" ON "communication_workflows" USING btree ("org_id","status","enabled");