CREATE TABLE "calendar_event_assignees" (
	"event_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_assignees_event_id_member_id_pk" PRIMARY KEY("event_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"assigned_to" uuid,
	"title" text NOT NULL,
	"description" text,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"location" text,
	"team_reminder_offset_minutes" integer,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_event_assignees" ADD CONSTRAINT "calendar_event_assignees_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_assignees" ADD CONSTRAINT "calendar_event_assignees_member_id_org_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_assignees" ADD CONSTRAINT "calendar_event_assignees_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_assigned_to_org_members_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_org_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_event_assignees_member_org" ON "calendar_event_assignees" USING btree ("member_id","org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_event_assignees_one_lead" ON "calendar_event_assignees" USING btree ("event_id") WHERE is_lead = true;--> statement-breakpoint
CREATE INDEX "idx_calendar_events_org_start" ON "calendar_events" USING btree ("org_id","start_at");--> statement-breakpoint

-- Tenant isolation (Rule 12). Writes happen via service-role through /api/*
-- routes; these policies gate client-side reads to the caller's own org.
ALTER TABLE "calendar_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "calendar_events: members select own org rows"
  ON "calendar_events"
  AS PERMISSIVE FOR SELECT TO "authenticated"
  USING (("org_id" = get_my_org_id()));--> statement-breakpoint

ALTER TABLE "calendar_event_assignees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "calendar_event_assignees: members select own org rows"
  ON "calendar_event_assignees"
  AS PERMISSIVE FOR SELECT TO "authenticated"
  USING (("org_id" = get_my_org_id()));