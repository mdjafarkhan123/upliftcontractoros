-- Add the contact_imports table to the Supabase Realtime publication so the
-- import modal can subscribe to its own import row and show live progress
-- (processed/imported/skipped/failed) and the final result without polling.
-- RLS already restricts SELECT to the owning org, so Realtime only delivers a
-- contact_imports row to members of its org. Guarded so re-running is a no-op.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_publication_tables
		WHERE pubname = 'supabase_realtime' AND tablename = 'contact_imports'
	) THEN
		ALTER PUBLICATION supabase_realtime ADD TABLE contact_imports;
	END IF;
END $$;
