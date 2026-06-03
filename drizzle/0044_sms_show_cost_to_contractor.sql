-- Per-org display gate (PO-controlled via /jafar). When true, the contractor
-- Settings → SMS Credits page reveals the per-SMS price and an estimated
-- "messages remaining". Default false preserves the "no complexity exposed to
-- the contractor" stance; existing rows stay hidden until the PO opts them in.
ALTER TABLE "org_sms_credit"
	ADD COLUMN IF NOT EXISTS "show_cost_to_contractor" boolean DEFAULT false NOT NULL;
