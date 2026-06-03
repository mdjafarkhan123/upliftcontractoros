-- Multi-assignee support for appointments.
--
-- `appointments.assigned_to` stays as the denormalized lead pointer (kept in
-- sync inside every assignee mutation transaction). This join table holds the
-- full crew. Lead invariant enforced by partial unique index.

CREATE TABLE "appointment_assignees" (
  "appointment_id" uuid NOT NULL,
  "member_id"      uuid NOT NULL,
  "org_id"         uuid NOT NULL,
  "is_lead"        boolean NOT NULL DEFAULT false,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "appointment_assignees_pkey"
    PRIMARY KEY ("appointment_id", "member_id"),
  CONSTRAINT "appointment_assignees_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE,
  CONSTRAINT "appointment_assignees_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "org_members"("id"),
  CONSTRAINT "appointment_assignees_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
);
--> statement-breakpoint

CREATE INDEX "idx_appt_assignees_member_org"
  ON "appointment_assignees" USING btree ("member_id", "org_id");
--> statement-breakpoint

CREATE UNIQUE INDEX "idx_appt_assignees_one_lead"
  ON "appointment_assignees" USING btree ("appointment_id")
  WHERE "is_lead" = true;
--> statement-breakpoint

ALTER TABLE "appointment_assignees" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Same shape as other org-scoped tables. Writes happen via service-role
-- through /api/* routes; this policy gates client-side reads.
CREATE POLICY "appointment_assignees: members select own org rows"
  ON "appointment_assignees"
  AS PERMISSIVE FOR SELECT TO "authenticated"
  USING (("org_id" = get_my_org_id()));
--> statement-breakpoint

-- Backfill: every existing lead becomes a (is_lead = true) row.
INSERT INTO "appointment_assignees" ("appointment_id", "member_id", "org_id", "is_lead")
SELECT "id", "assigned_to", "org_id", true
FROM "appointments"
WHERE "assigned_to" IS NOT NULL
  AND "deleted_at" IS NULL;
