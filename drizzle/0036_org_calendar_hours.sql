-- Org-level calendar visible hours.
--
-- Drives the time rail on the internal appointments calendar (Week / Day view).
-- Off-hours are dimmed but bookings outside this range still display — this is
-- a UI hint, not a hard constraint. Stored as smallint hours [0..24] with
-- end > start. Defaults 7am..7pm cover the typical contractor field-day.
--
-- No new RLS policy needed: columns inherit the existing `organizations` table
-- policies (only the owning org's members can read; writes are service-role
-- through /api/settings/org).

ALTER TABLE "organizations"
  ADD COLUMN "calendar_day_start_hour" smallint NOT NULL DEFAULT 7,
  ADD COLUMN "calendar_day_end_hour"   smallint NOT NULL DEFAULT 19;
--> statement-breakpoint

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_calendar_hours_range_chk"
  CHECK (
    "calendar_day_start_hour" >= 0
    AND "calendar_day_end_hour" <= 24
    AND "calendar_day_end_hour" > "calendar_day_start_hour"
  );
