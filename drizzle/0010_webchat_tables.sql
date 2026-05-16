-- Migration 2: Create webchat_widgets and webchat_sessions tables

CREATE TABLE IF NOT EXISTS "webchat_widgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL UNIQUE REFERENCES "organizations"("id"),
	"display_name" text,
	"intro_message" text DEFAULT 'We''ll text you back — no robocalls, just a real person from our team.',
	"offline_message" text DEFAULT 'We''re currently on site helping customers. Leave your details and we''ll reply as soon as possible.',
	"webchat_mode" text NOT NULL DEFAULT 'asynchronous',
	"domain_allowlist" text[] NOT NULL DEFAULT '{}',
	"is_active" boolean NOT NULL DEFAULT true,
	"created_at" timestamptz NOT NULL DEFAULT now(),
	"updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "webchat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "organizations"("id"),
	"contact_id" uuid NOT NULL REFERENCES "contacts"("id"),
	"conversation_id" uuid NOT NULL REFERENCES "conversations"("id"),
	"session_token" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
	"visitor_ip_hash" text,
	"user_agent_hash" text,
	"last_active_at" timestamptz NOT NULL DEFAULT now(),
	"created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_webchat_widgets_org_id" ON "webchat_widgets" ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webchat_sessions_org_id" ON "webchat_sessions" ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webchat_sessions_session_token" ON "webchat_sessions" ("session_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webchat_sessions_last_active" ON "webchat_sessions" ("last_active_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webchat_sessions_conversation_id" ON "webchat_sessions" ("conversation_id");--> statement-breakpoint

-- Seed one default webchat_widgets row for every existing org
INSERT INTO "webchat_widgets" ("org_id")
SELECT "id" FROM "organizations"
WHERE "deleted_at" IS NULL
ON CONFLICT ("org_id") DO NOTHING;
