-- contact_imports was created (migration 0075) without row-level security. Every
-- tenant table must enforce org isolation at the DB layer (and Supabase Realtime
-- only delivers a row to a browser client that can SELECT it under RLS). Enable
-- RLS and add the same org-scoped SELECT policy that contacts/media use.
--
-- Only a SELECT policy for the `authenticated` role is needed: all writes go
-- through the server's privileged connection, which bypasses RLS. The browser
-- only ever reads its own import row (Realtime progress + GET fallback).
-- Guarded so re-running is a no-op.
ALTER TABLE "contact_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE tablename = 'contact_imports'
		AND policyname = 'contact_imports: members select own org imports'
	) THEN
		CREATE POLICY "contact_imports: members select own org imports"
			ON "contact_imports" AS PERMISSIVE FOR SELECT TO "authenticated"
			USING (org_id = get_my_org_id());
	END IF;
END $$;
