-- Contact P3 gap: profile photo / avatar.
--
-- Stores the R2 object key of the processed avatar image (same convention as
-- organizations.logo_url). Resolved to a short-lived signed URL on read via
-- resolveLogoUrl(). The backing media row is org-scoped (purpose_tag
-- 'contact_avatar', no contact FK) so it never appears in the contact Files tab.

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "avatar_url" text;
