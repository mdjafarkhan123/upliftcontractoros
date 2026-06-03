-- Pipeline assigned-view permission.
-- Adds the missing companion boolean so the pipeline module supports the same
-- All / Mine / None tri-state as conversations, appointments, and jobs.
-- Also rewrites the broken opportunities Policy B (the original migration shipped
-- it with no USING clause, so it permitted every row to authenticated callers —
-- the Policy A boolean gate was effectively the only thing protecting the table).

ALTER TABLE "org_members"
  ADD COLUMN "can_view_assigned_opportunities" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- Backfill: admins already have full pipeline access via can_view_full_pipeline,
-- but seed the new column TRUE for them too so future template re-applications
-- match the documented "admin gets all 40 booleans TRUE" rule.
UPDATE "org_members" SET "can_view_assigned_opportunities" = true WHERE "role" = 'admin';
--> statement-breakpoint

DROP POLICY IF EXISTS "opportunities: assigned member access" ON "opportunities";
--> statement-breakpoint

CREATE POLICY "opportunities: assigned member access" ON "opportunities"
  AS PERMISSIVE FOR SELECT TO "authenticated"
  USING (
    (org_id = get_my_org_id())
    AND (deleted_at IS NULL)
    AND (assigned_to = get_my_member_id())
    AND (
      (SELECT org_members.can_view_assigned_opportunities
         FROM org_members
        WHERE org_members.supabase_user_id = auth.uid()
          AND org_members.is_active = true
          AND org_members.deleted_at IS NULL
        LIMIT 1) = true
    )
  );
