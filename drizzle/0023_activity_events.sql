-- Dashboard Recent Activity feed table.
-- Append-only. Populated by outbox worker on dispatch.
-- Decoupled from outbox_events so feed history survives outbox retention/cleanup.

CREATE TABLE IF NOT EXISTS "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"contact_id" uuid,
	"payload" jsonb NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_events_org_id_organizations_id_fk"
		FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "activity_events_org_occurred_idx"
	ON "activity_events" ("org_id", "occurred_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "activity_events_org_type_occurred_idx"
	ON "activity_events" ("org_id", "event_type", "occurred_at" DESC);
--> statement-breakpoint

-- Backfill from outbox_events for the event types the dashboard renders.
-- Safe to run multiple times: activity_events starts empty; subsequent runs would
-- create duplicates so this statement is intended to execute exactly once at deploy.
INSERT INTO "activity_events"
	("org_id", "event_type", "resource_type", "resource_id", "contact_id",
	 "payload", "event_version", "occurred_at", "created_at")
SELECT
	oe.org_id,
	oe.event_type,
	oe.resource_type,
	oe.resource_id,
	NULLIF(oe.payload->>'contact_id', '')::uuid AS contact_id,
	oe.payload,
	COALESCE((oe.payload->>'event_version')::int, 1) AS event_version,
	oe.created_at AS occurred_at,
	now() AS created_at
FROM "outbox_events" oe
WHERE oe.event_type IN (
	'contact.created',
	'quote.viewed',
	'quote.accepted',
	'quote.declined',
	'opportunity.created',
	'opportunity.stage_changed',
	'opportunity.lost',
	'opportunity.won',
	'job.completed',
	'invoice.paid',
	'payment.recorded',
	'review.received',
	'contact.status_changed'
)
AND oe.org_id IS NOT NULL;
