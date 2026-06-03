-- Link-first review funnel: each review_request gets a short, unguessable
-- public token (delivered in the SMS), a 14-day expiry, and a submission
-- counter used for rate limiting. The public landing page (/r/{token}) reads
-- and updates by token; the SMS digit-reply path has been removed.

ALTER TABLE "review_requests"
  ADD COLUMN IF NOT EXISTS "token" text;

ALTER TABLE "review_requests"
  ADD COLUMN IF NOT EXISTS "token_expires_at" timestamp with time zone;

ALTER TABLE "review_requests"
  ADD COLUMN IF NOT EXISTS "submission_count" integer NOT NULL DEFAULT 0;

-- Backfill tokens for in-flight 'sent' requests so links keep working after
-- deploy. 12 chars of base62 from gen_random_bytes — generated only where
-- still null. 14-day expiry from now (these were already in their reply
-- window pre-deploy).
DO $$
DECLARE
  alphabet text := '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  rec record;
  candidate text;
  i int;
  raw bytea;
BEGIN
  FOR rec IN
    SELECT id FROM review_requests
    WHERE status = 'sent' AND token IS NULL AND deleted_at IS NULL
  LOOP
    LOOP
      raw := gen_random_bytes(9);
      candidate := '';
      FOR i IN 0..11 LOOP
        candidate := candidate || substr(alphabet, 1 + (get_byte(raw, i % 9) % 62), 1);
      END LOOP;
      BEGIN
        UPDATE review_requests
          SET token = candidate,
              token_expires_at = now() + interval '14 days'
          WHERE id = rec.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- retry on collision
      END;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "review_requests_token_unique"
  ON "review_requests" ("token");
