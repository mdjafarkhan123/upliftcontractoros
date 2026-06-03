-- Refresh the default first-message for the review funnel with warmer,
-- more emotional copy that includes the {review_link} call to action.
-- Backfill only rows whose current message still matches a known prior default;
-- contractor-customized messages are left untouched.

ALTER TABLE "automation_settings"
  ALTER COLUMN "review_funnel_message" SET DEFAULT
    'Hi {contact_name}, it was a pleasure working with you. A quick review from you means the world to a small team like ours at {org_name} — and helps neighbors find us too. Takes 20 seconds: {review_link}';
--> statement-breakpoint

UPDATE "automation_settings"
SET "review_funnel_message" =
  'Hi {contact_name}, it was a pleasure working with you. A quick review from you means the world to a small team like ours at {org_name} — and helps neighbors find us too. Takes 20 seconds: {review_link}'
WHERE "review_funnel_message" IN (
  'Hi {contact_name}, thank you for choosing us! How did we do today? Reply with a number from 1–5.',
  'Hi {contact_name}, thanks for choosing us! How did we do? Tap to rate: {review_link}'
);
