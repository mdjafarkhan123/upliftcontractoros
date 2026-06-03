-- Fix two RLS policies that shipped in 0000 without a USING clause.
-- "jobs: assigned member access" and "conversations: assigned member access"
-- both defaulted to USING (true), which OR'd with their sibling SELECT
-- policies and effectively exposed every row across every org to any
-- authenticated caller. Same shape as the opportunities fix in 0024.

DROP POLICY IF EXISTS "jobs: assigned member access" ON "jobs";
--> statement-breakpoint

CREATE POLICY "jobs: assigned member access" ON "jobs"
  AS PERMISSIVE FOR SELECT TO "authenticated"
  USING (
    (org_id = get_my_org_id())
    AND (deleted_at IS NULL)
    AND (assigned_to = get_my_member_id())
    AND (
      (SELECT org_members.can_view_assigned_jobs
         FROM org_members
        WHERE org_members.supabase_user_id = auth.uid()
          AND org_members.is_active = true
          AND org_members.deleted_at IS NULL
        LIMIT 1) = true
    )
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "conversations: assigned member access" ON "conversations";
--> statement-breakpoint

CREATE POLICY "conversations: assigned member access" ON "conversations"
  AS PERMISSIVE FOR SELECT TO "authenticated"
  USING (
    (org_id = get_my_org_id())
    AND (deleted_at IS NULL)
    AND (assigned_to = get_my_member_id())
    AND (
      (SELECT org_members.can_view_assigned_conversations
         FROM org_members
        WHERE org_members.supabase_user_id = auth.uid()
          AND org_members.is_active = true
          AND org_members.deleted_at IS NULL
        LIMIT 1) = true
    )
  );
