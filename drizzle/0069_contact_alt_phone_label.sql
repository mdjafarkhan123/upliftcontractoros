-- Contact alt phone type label (GHL/Jobber convention).
--
-- The secondary number (alt_phone) previously showed only a generic "(alt)" tag.
-- Top CRMs label a secondary number by *type* (mobile/home/work/fax/other), never
-- a freeform name. This adds:
-- 1. phone_label enum (mobile|home|work|fax|other).
-- 2. contacts.alt_phone_label column — nullable (unlabeled alt number). Always
--    cleared together with alt_phone in the API layer.

DO $$ BEGIN
  CREATE TYPE "phone_label" AS ENUM('mobile', 'home', 'work', 'fax', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "alt_phone_label" "phone_label";
