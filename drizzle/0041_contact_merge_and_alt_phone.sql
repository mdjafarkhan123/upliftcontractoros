-- Contact merge support + secondary phone.
--
-- 1. contacts.alt_phone: secondary callable/searchable number, populated by the
--    merge-duplicates flow so an absorbed contact's different phone is never lost.
--    Not covered by the (org_id, phone) uniqueness constraint.
-- 2. org_members.can_merge_contacts: admin-tier permission gating the merge flow.
--    Merge reparents the entire contact graph (data surgery), so it is stricter
--    than delete. Existing admin members are granted it; everyone else stays false.

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "alt_phone" text;--> statement-breakpoint

ALTER TABLE "org_members"
  ADD COLUMN IF NOT EXISTS "can_merge_contacts" boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- Backfill: existing admins keep full capability parity. role is used here only
-- for one-time seeding of the new permission, never for runtime authorization.
UPDATE "org_members" SET "can_merge_contacts" = true WHERE "role" = 'admin';
