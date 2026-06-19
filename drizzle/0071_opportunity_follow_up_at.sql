-- Pipeline gap #2 (Phase A) — per-deal follow-up reminder timestamp.
-- Single nullable column; the opportunity-follow-up-due cron sweeps it like the
-- existing contacts.next_follow_up_at stack. Hand-trimmed (drizzle-kit generate
-- emits a full-schema diff against the stale baseline — see note atop 0070).
ALTER TABLE "opportunities" ADD COLUMN "next_follow_up_at" timestamp with time zone;
