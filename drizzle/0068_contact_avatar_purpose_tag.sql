-- Add the 'contact_avatar' value to the media purpose-tag enum so contact
-- profile photos can be uploaded through the standard media pipeline. The
-- backing media row carries contact_id (satisfies media_exactly_one_parent)
-- and is excluded from the contact Files tab by purpose_tag in the list query.

ALTER TYPE "media_purpose_tag" ADD VALUE IF NOT EXISTS 'contact_avatar';
