CREATE TYPE "public"."follow_up_outcome" AS ENUM('called', 'texted', 'emailed', 'visited', 'no_answer');
--> statement-breakpoint
CREATE TABLE "opportunity_follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"logged_by" uuid NOT NULL,
	"outcome" "follow_up_outcome" NOT NULL,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunity_follow_ups" ADD CONSTRAINT "opportunity_follow_ups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "opportunity_follow_ups" ADD CONSTRAINT "opportunity_follow_ups_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "opportunity_follow_ups" ADD CONSTRAINT "opportunity_follow_ups_logged_by_org_members_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_opp_follow_ups_opportunity_id" ON "opportunity_follow_ups" USING btree ("opportunity_id");
--> statement-breakpoint
CREATE INDEX "idx_opp_follow_ups_org_id" ON "opportunity_follow_ups" USING btree ("org_id");
