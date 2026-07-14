-- quote_packages was created (migration 0138) without row-level security. Every
-- tenant table must enforce org isolation at the DB layer (Rule 10). The parent
-- quotes / quote_line_items tables both carry the same org-scoped SELECT policy;
-- mirror it here so a tiered quote's packages are never cross-tenant readable.
--
-- Only a SELECT policy for the `authenticated` role is needed: all writes go
-- through the server's privileged connection, which bypasses RLS. Guarded so
-- re-running is a no-op.
ALTER TABLE "quote_packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE tablename = 'quote_packages'
		AND policyname = 'quote_packages: members select own org packages'
	) THEN
		CREATE POLICY "quote_packages: members select own org packages"
			ON "quote_packages" AS PERMISSIVE FOR SELECT TO "authenticated"
			USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL)));
	END IF;
END $$;
