-- Add idempotency_key to notifications + partial unique index
ALTER TABLE "notifications" ADD COLUMN "idempotency_key" text;
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_idempotency_key_uq"
  ON "notifications" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- Dead-letter visibility index for /jafar
CREATE INDEX IF NOT EXISTS "idx_outbox_events_dead_lettered"
  ON "outbox_events" ("org_id", "dead_lettered_at")
  WHERE "status" = 'dead_lettered';

-- Pending claim index for outbox worker
CREATE INDEX IF NOT EXISTS "idx_outbox_events_pending"
  ON "outbox_events" ("available_at", "sequence")
  WHERE "status" = 'pending';

-- pg_notify trigger for outbox INSERT
CREATE OR REPLACE FUNCTION public.notify_outbox_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  PERFORM pg_notify('outbox_channel', NEW.id::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outbox_notify ON public.outbox_events;
CREATE TRIGGER outbox_notify
AFTER INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION public.notify_outbox_insert();
