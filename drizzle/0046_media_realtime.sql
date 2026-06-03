-- Add the media table to the Supabase Realtime publication so inbound MMS photos
-- (and any async-attached media) appear in an open thread without a refresh.
-- RLS already restricts SELECT to the owning org, so Realtime only delivers a
-- media row to members of its org. Guarded so re-running is a no-op.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_publication_tables
		WHERE pubname = 'supabase_realtime' AND tablename = 'media'
	) THEN
		ALTER PUBLICATION supabase_realtime ADD TABLE media;
	END IF;
END $$;
