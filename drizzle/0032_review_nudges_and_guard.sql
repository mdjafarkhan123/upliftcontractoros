-- Review lifecycle phase 2: nudge message templates + likely_reviewed guard.
-- Depends on 0031_review_lifecycle.

------------------------------------------------------------------------------
-- 1. automation_settings: nudge 1 + nudge 2 SMS templates
------------------------------------------------------------------------------
ALTER TABLE "automation_settings"
  ADD COLUMN "review_funnel_nudge_1_message" text NOT NULL DEFAULT
    'Hi {contact_name}, you''re one tap away from leaving us a Google review — it''d mean a lot to our small team at {org_name}. Finish here: {review_link}',
  ADD COLUMN "review_funnel_nudge_2_message" text NOT NULL DEFAULT
    '{contact_name}, last gentle nudge from {org_name} — your review genuinely helps neighbors find us. 20 seconds: {review_link}';--> statement-breakpoint

------------------------------------------------------------------------------
-- 2. review_requests: likely_reviewed integrity guard
------------------------------------------------------------------------------
-- A row may only be 'likely_reviewed' if the attribution engine claimed it:
--   • submitted_rating ≥ 4 (positive funnel only)
--   • attributed_at populated (audit trail)
--   • confidence_score populated (probabilistic output present)
ALTER TABLE "review_requests"
  ADD CONSTRAINT "review_requests_likely_reviewed_guard_check"
  CHECK (
    status <> 'likely_reviewed'
    OR (
      submitted_rating IS NOT NULL
      AND submitted_rating >= 4
      AND attributed_at IS NOT NULL
      AND confidence_score IS NOT NULL
    )
  );
