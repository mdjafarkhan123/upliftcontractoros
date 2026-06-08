import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	integer,
	bigint,
	numeric,
	timestamp,
	date,
	jsonb,
	primaryKey,
	index,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export interface IntegrationStatus {
	[key: string]: unknown;
}

export const orgStatusEnum = pgEnum('org_status', [
	'active',
	'suspended',
	'pending_deletion',
	'deleted',
	// Set on creation; the org is held in the onboarding wizard until it completes,
	// at which point status flips to 'active'. (Gate wiring lands with the wizard.)
	'pending_setup'
]);

// Carrier/compliance state for the org's SMS sender (10DLC in US, CWTA in Canada).
// 'not_required' covers SMS-disabled orgs and countries with no registration step.
export const smsApprovalStatusEnum = pgEnum('sms_approval_status', [
	'not_required',
	'pending',
	'approved',
	'rejected'
]);

export const memberRoleEnum = pgEnum('member_role', ['admin', 'manager', 'member']);

export const organizations = pgTable('organizations', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	trade_type: text('trade_type').notNull(),
	// Nullable: an org may onboard without a number ("skip number / SMS optional").
	// Inbound/outbound SMS + PDF sender display all guard against null.
	twilio_phone_number: text('twilio_phone_number'),
	// Per-contractor Twilio subaccount that owns this org's number. Populated by
	// provisioning (Step 5.2). Null = no number yet, or a legacy master-owned number.
	// Auth token stored plaintext, consistent with stripe_webhook_secret/_restricted_key.
	twilio_subaccount_sid: text('twilio_subaccount_sid'),
	twilio_subaccount_auth_token: text('twilio_subaccount_auth_token'),
	status: orgStatusEnum('status').notNull().default('active'),
	plan: text('plan').notNull().default('starter'),
	stripe_restricted_key: text('stripe_restricted_key'),
	stripe_publishable_key: text('stripe_publishable_key'),
	stripe_webhook_secret: text('stripe_webhook_secret'),
	stripe_account_id: text('stripe_account_id'),
	stripe_account_name: text('stripe_account_name'),
	stripe_account_email: text('stripe_account_email'),
	stripe_livemode: boolean('stripe_livemode'),
	stripe_connected_at: timestamp('stripe_connected_at', { withTimezone: true }),
	stripe_last_verified_at: timestamp('stripe_last_verified_at', { withTimezone: true }),
	logo_url: text('logo_url'),
	primary_color: text('primary_color'),
	timezone: text('timezone').notNull().default('America/Chicago'),
	address: text('address'),
	city: text('city'),
	state: text('state'),
	zip: text('zip'),
	is_setup_complete: boolean('is_setup_complete').notNull().default(false),

	// --- Onboarding & SMS activation foundation (Blueprint §10 + Onboarding.md) ---
	// Master SMS switch, PO-controlled in /jafar/org. When false: SMS UI hidden,
	// outbound blocked, and SMS sub-feature flags are overridden at runtime — their
	// stored values are preserved (not wiped) so re-enabling restores prior config.
	sms_enabled: boolean('sms_enabled').notNull().default(true),
	// ISO 3166-1 alpha-2 country (e.g. 'US', 'CA', 'GB'), collected in onboarding Step 2.
	// Drives phone availability and carrier-approval requirements.
	country: text('country'),
	// Carrier registration state for outbound SMS (10DLC in US, CWTA in Canada). Outbound
	// is gated until 'approved' or 'not_required'; inbound + calls are allowed regardless.
	sms_approval_status: smsApprovalStatusEnum('sms_approval_status')
		.notNull()
		.default('not_required'),
	sms_approval_submitted_at: timestamp('sms_approval_submitted_at', { withTimezone: true }),
	// External registration id (e.g. Twilio Trust Hub / messaging campaign SID).
	sms_approval_external_id: text('sms_approval_external_id'),
	// PO-supplied reason when a carrier submission is rejected / needs resubmission.
	// Persisted so the contractor and the /jafar Details tab both see it.
	sms_approval_reason: text('sms_approval_reason'),

	// --- Carrier registration (Onboarding.md Step 4) ---
	// Collected from the contractor in the onboarding wizard (US 10DLC / CA CWTA),
	// then copied by the PO for manual Twilio submission. All nullable: the step is
	// skippable and only applies to US/CA orgs that bought a number. Address is reused
	// from the existing address/city/state/zip columns, not duplicated here.
	// US legal business name / CA registered business name.
	legal_business_name: text('legal_business_name'),
	// US Employer Identification Number (10DLC).
	ein: text('ein'),
	// Canadian Business Number (CWTA).
	business_number: text('business_number'),
	// US business website (10DLC).
	website: text('website'),
	// Free-text description of how the org will use SMS (10DLC use case).
	messaging_use_case: text('messaging_use_case'),

	suspended_at: timestamp('suspended_at', { withTimezone: true }),
	deletion_scheduled_at: timestamp('deletion_scheduled_at', { withTimezone: true }),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

	feature_one_way_sms: boolean('feature_one_way_sms').notNull().default(true),
	feature_two_way_sms: boolean('feature_two_way_sms').notNull().default(false),
	feature_bulk_sms: boolean('feature_bulk_sms').notNull().default(false),
	feature_conversations: boolean('feature_conversations').notNull().default(true),
	feature_missed_call_textback: boolean('feature_missed_call_textback').notNull().default(false),
	feature_team_management: boolean('feature_team_management').notNull().default(true),
	feature_appointments: boolean('feature_appointments').notNull().default(true),
	feature_media_uploads: boolean('feature_media_uploads').notNull().default(true),
	feature_automation_engine: boolean('feature_automation_engine').notNull().default(false),
	feature_review_funnel: boolean('feature_review_funnel').notNull().default(false),
	feature_appointment_reminders: boolean('feature_appointment_reminders').notNull().default(false),
	feature_invoice_reminders: boolean('feature_invoice_reminders').notNull().default(false),
	feature_financial_tools: boolean('feature_financial_tools').notNull().default(true),
	feature_stripe_payments: boolean('feature_stripe_payments').notNull().default(false),
	feature_growth_feed: boolean('feature_growth_feed').notNull().default(false),
	feature_advanced_reporting: boolean('feature_advanced_reporting').notNull().default(false),
	feature_ai_assistant: boolean('feature_ai_assistant').notNull().default(false),
	feature_custom_branding: boolean('feature_custom_branding').notNull().default(false),
	feature_api_access: boolean('feature_api_access').notNull().default(false),
	feature_webhooks: boolean('feature_webhooks').notNull().default(false),
	feature_client_portal: boolean('feature_client_portal').notNull().default(false),
	feature_webchat: boolean('feature_webchat').notNull().default(false),
	feature_online_booking: boolean('feature_online_booking').notNull().default(false),
	// Facebook Messenger inbox channel. Default false; flipped on per-org only after
	// Meta App Review approves pages_messaging. Gates the Integrations connect card
	// and drops messenger outbox events for orgs without it (see featureMap).
	feature_messenger: boolean('feature_messenger').notNull().default(false),

	// Master capability gates added in 0026 to close gaps where contractor toggles
	// existed with no jafar-side gate. Default false; flipped on per plan template.
	feature_payment_receipt: boolean('feature_payment_receipt').notNull().default(false),
	feature_quote_followup: boolean('feature_quote_followup').notNull().default(false),
	feature_speed_to_lead: boolean('feature_speed_to_lead').notNull().default(false),

	// SMS channel allowances (jafar layer). Gates the SMS variant of automations
	// that have or may have an email channel. SMS-only automations (missed_call_textback,
	// speed_to_lead) use their capability flag as the SMS gate.
	payment_receipt_sms_allowed: boolean('payment_receipt_sms_allowed').notNull().default(false),
	quote_followup_sms_allowed: boolean('quote_followup_sms_allowed').notNull().default(false),
	appointment_reminder_sms_allowed: boolean('appointment_reminder_sms_allowed')
		.notNull()
		.default(false),
	invoice_reminder_sms_allowed: boolean('invoice_reminder_sms_allowed').notNull().default(false),
	review_funnel_sms_allowed: boolean('review_funnel_sms_allowed').notNull().default(false),

	// Widget token: generated once, immutable, used to identify the org from the public widget
	widget_token: uuid('widget_token')
		.notNull()
		.default(sql`gen_random_uuid()`)
		.unique(),

	// Local-part for contractor outbound email on the shared apex (e.g. "acme-roofing"
	// → acme-roofing@<EMAIL_APEX_DOMAIN>). Backfilled from slug at migration time.
	email_sender_local: text('email_sender_local'),

	max_team_members: integer('max_team_members').notNull().default(3),
	max_monthly_sms: integer('max_monthly_sms').notNull().default(500),
	max_bulk_sms_per_day: integer('max_bulk_sms_per_day').notNull().default(50),
	// Outbound SMS send-rate throttles (PO-controlled per org via /jafar Usage
	// limits). 0 = unlimited (only the platform-wide SMS_RATE_GLOBAL_PER_MIN cap
	// applies). A send that hits a cap is deferred (re-queued), never dropped.
	max_sms_per_minute: integer('max_sms_per_minute').notNull().default(30),
	max_sms_per_day: integer('max_sms_per_day').notNull().default(1000),
	max_ai_requests_per_month: integer('max_ai_requests_per_month').notNull().default(0),
	max_storage_gb: integer('max_storage_gb').notNull().default(5),
	max_automation_workflows: integer('max_automation_workflows').notNull().default(0),

	integration_status: jsonb('integration_status').$type<IntegrationStatus>().notNull().default({}),
	feature_overrides_updated_at: timestamp('feature_overrides_updated_at', { withTimezone: true }),
	feature_flags_updated_by: uuid('feature_flags_updated_by').references((): any => orgMembers.id),

	// Review attribution: admin-supplied baseline of the org's Google review count.
	// Used by the attribution engine to compute Δ when an admin reconciles the count.
	last_known_review_count: integer('last_known_review_count').notNull().default(0),
	last_review_check_at: timestamp('last_review_check_at', { withTimezone: true }),

	// Visible-hours range for the internal appointments calendar (time rail).
	// Off-hours appointments still render; this is a display hint, not a constraint.
	calendar_day_start_hour: integer('calendar_day_start_hour').notNull().default(7),
	calendar_day_end_hour: integer('calendar_day_end_hour').notNull().default(19),

	// SMS quiet hours (Blueprint §10 / Onboarding.md Part 10 compliance). Outbound SMS
	// is held during this window, evaluated in the org's own `timezone`; deferred jobs
	// auto-send when the window opens (never dropped). Defaults to the TCPA-safe window
	// (block 9 PM → 8 AM local) so every org is compliant out of the box. start_hour and
	// end_hour are 0–23; start > end means an overnight window (the common case).
	quiet_hours_enabled: boolean('quiet_hours_enabled').notNull().default(true),
	quiet_hours_start_hour: integer('quiet_hours_start_hour').notNull().default(21),
	quiet_hours_end_hour: integer('quiet_hours_end_hour').notNull().default(8)
});

export type Organization = InferSelectModel<typeof organizations>;
export type NewOrganization = InferInsertModel<typeof organizations>;

export const orgMembers = pgTable('org_members', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	supabase_user_id: uuid('supabase_user_id').notNull().unique(),
	email: text('email').notNull(),
	full_name: text('full_name').notNull(),
	avatar_url: text('avatar_url'),
	role: memberRoleEnum('role').notNull(),
	is_active: boolean('is_active').notNull().default(true),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

	// Module 1: Dashboard
	can_view_dashboard: boolean('can_view_dashboard').notNull().default(false),
	can_view_revenue: boolean('can_view_revenue').notNull().default(false),
	can_view_pipeline_snapshot: boolean('can_view_pipeline_snapshot').notNull().default(false),

	// Module 2: Inbox
	can_view_all_conversations: boolean('can_view_all_conversations').notNull().default(false),
	can_view_assigned_conversations: boolean('can_view_assigned_conversations')
		.notNull()
		.default(false),
	can_send_messages: boolean('can_send_messages').notNull().default(false),
	can_delete_conversations: boolean('can_delete_conversations').notNull().default(false),

	// Module 3: Contacts
	can_view_all_contacts: boolean('can_view_all_contacts').notNull().default(false),
	can_create_contacts: boolean('can_create_contacts').notNull().default(false),
	can_edit_contacts: boolean('can_edit_contacts').notNull().default(false),
	can_delete_contacts: boolean('can_delete_contacts').notNull().default(false),
	// Merge duplicate contacts. Distinct from delete: merge reparents every
	// linked record across the contact graph (data surgery), so it is an
	// admin-tier capability — granted to the admin role template only.
	can_merge_contacts: boolean('can_merge_contacts').notNull().default(false),

	// Module 4: Pipeline
	can_view_full_pipeline: boolean('can_view_full_pipeline').notNull().default(false),
	can_view_assigned_opportunities: boolean('can_view_assigned_opportunities')
		.notNull()
		.default(false),
	can_move_pipeline_stages: boolean('can_move_pipeline_stages').notNull().default(false),
	can_create_opportunities: boolean('can_create_opportunities').notNull().default(false),

	// Module 4 (cont.): Jobs
	can_view_assigned_jobs: boolean('can_view_assigned_jobs').notNull().default(false),

	// Module 5: Quotes
	can_view_all_quotes: boolean('can_view_all_quotes').notNull().default(false),
	can_create_quotes: boolean('can_create_quotes').notNull().default(false),
	can_send_quotes: boolean('can_send_quotes').notNull().default(false),
	can_edit_quotes: boolean('can_edit_quotes').notNull().default(false),
	can_delete_quotes: boolean('can_delete_quotes').notNull().default(false),

	// Module 6: Invoices
	can_view_all_invoices: boolean('can_view_all_invoices').notNull().default(false),
	can_create_invoices: boolean('can_create_invoices').notNull().default(false),
	can_send_invoices: boolean('can_send_invoices').notNull().default(false),
	can_record_payments: boolean('can_record_payments').notNull().default(false),
	can_delete_invoices: boolean('can_delete_invoices').notNull().default(false),

	// Module 7: Appointments
	can_view_all_appointments: boolean('can_view_all_appointments').notNull().default(false),
	can_view_assigned_appointments: boolean('can_view_assigned_appointments')
		.notNull()
		.default(false),
	can_create_appointments: boolean('can_create_appointments').notNull().default(false),
	can_reschedule_appointments: boolean('can_reschedule_appointments').notNull().default(false),

	// Module 8: Reputation
	can_view_reviews: boolean('can_view_reviews').notNull().default(false),
	can_send_review_requests: boolean('can_send_review_requests').notNull().default(false),
	can_view_negative_feedback: boolean('can_view_negative_feedback').notNull().default(false),

	// Module 9: Growth Feed
	can_view_growth_feed: boolean('can_view_growth_feed').notNull().default(false),

	// Module 10: Files & Media
	can_view_all_files: boolean('can_view_all_files').notNull().default(false),
	can_upload_files: boolean('can_upload_files').notNull().default(false),
	can_delete_files: boolean('can_delete_files').notNull().default(false),

	// Module 11: Team Management
	can_view_team_members: boolean('can_view_team_members').notNull().default(false),
	can_create_team_members: boolean('can_create_team_members').notNull().default(false),
	can_edit_team_members: boolean('can_edit_team_members').notNull().default(false),
	can_delete_team_members: boolean('can_delete_team_members').notNull().default(false)
});

export type OrgMember = InferSelectModel<typeof orgMembers>;
export type NewOrgMember = InferInsertModel<typeof orgMembers>;

export const automationSettings = pgTable('automation_settings', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	missed_call_textback_enabled: boolean('missed_call_textback_enabled').notNull().default(true),
	missed_call_textback_message: text('missed_call_textback_message').notNull(),
	quote_followup_enabled: boolean('quote_followup_enabled').notNull().default(true),
	quote_followup_delay_1_hours: integer('quote_followup_delay_1_hours').notNull().default(24),
	quote_followup_delay_2_hours: integer('quote_followup_delay_2_hours').notNull().default(72),
	quote_followup_message: text('quote_followup_message').notNull(),
	invoice_reminder_enabled: boolean('invoice_reminder_enabled').notNull().default(true),
	invoice_reminder_delay_days: integer('invoice_reminder_delay_days').notNull().default(3),
	invoice_reminder_message: text('invoice_reminder_message').notNull(),
	review_funnel_enabled: boolean('review_funnel_enabled').notNull().default(true),
	review_funnel_delay_hours: integer('review_funnel_delay_hours').notNull().default(2),
	review_funnel_message: text('review_funnel_message').notNull(),
	review_funnel_reminder_enabled: boolean('review_funnel_reminder_enabled').notNull().default(true),
	review_funnel_reminder_message: text('review_funnel_reminder_message').notNull(),
	review_funnel_nudge_1_message: text('review_funnel_nudge_1_message').notNull(),
	review_funnel_nudge_2_message: text('review_funnel_nudge_2_message').notNull(),
	google_review_link: text('google_review_link'),
	appointment_reminder_enabled: boolean('appointment_reminder_enabled').notNull().default(true),
	appointment_reminder_hours_before: integer('appointment_reminder_hours_before')
		.notNull()
		.default(24),
	appointment_reminder_message: text('appointment_reminder_message').notNull(),
	appointment_reminder_1h_enabled: boolean('appointment_reminder_1h_enabled')
		.notNull()
		.default(true),
	appointment_reminder_1h_message: text('appointment_reminder_1h_message').notNull(),
	appointment_confirmation_enabled: boolean('appointment_confirmation_enabled')
		.notNull()
		.default(true),
	appointment_confirmation_sms_message: text('appointment_confirmation_sms_message').notNull(),
	appointment_confirmation_email_subject: text('appointment_confirmation_email_subject').notNull(),
	appointment_confirmation_email_message: text('appointment_confirmation_email_message').notNull(),
	payment_receipt_enabled: boolean('payment_receipt_enabled').notNull().default(true),
	payment_receipt_message: text('payment_receipt_message').notNull(),
	payment_receipt_sms_enabled: boolean('payment_receipt_sms_enabled').notNull().default(false),
	payment_receipt_sms_message: text('payment_receipt_sms_message').notNull(),
	speed_to_lead_enabled: boolean('speed_to_lead_enabled').notNull().default(true),
	speed_to_lead_message: text('speed_to_lead_message').notNull(),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type AutomationSettings = InferSelectModel<typeof automationSettings>;
export type NewAutomationSettings = InferInsertModel<typeof automationSettings>;

// Per-org usage counters. PK (org_id, period_start_date, metric).
// period_start_date = '1900-01-01' is the sentinel for lifetime metrics
// (storage_bytes, automation_workflows). Monthly metrics use
// date_trunc('month', now())::date; daily metrics use now()::date.
// Migration (incl. CHECK constraints + RLS) is run directly in Supabase —
// this Drizzle row exists for typed queries only.
export const orgUsage = pgTable(
	'org_usage',
	{
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		period_start_date: date('period_start_date').notNull().default('1900-01-01'),
		metric: text('metric').notNull(),
		value: bigint('value', { mode: 'number' }).notNull().default(0),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		last_incremented_at: timestamp('last_incremented_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(table) => ({
		pk: primaryKey({ columns: [table.org_id, table.period_start_date, table.metric] })
	})
);

export type OrgUsage = InferSelectModel<typeof orgUsage>;
export type NewOrgUsage = InferInsertModel<typeof orgUsage>;

// ── SMS credit system ──────────────────────────────────────────────────────
// Dollar-denominated prepaid credit. Replaces the count-based max_monthly_sms
// gate as the authoritative SMS money guard. Money is numeric(12,4) so sub-cent
// Twilio pricing and PO per-SMS prices are exact; all balance math runs in
// Postgres (never JS floats). See $lib/server/sms/credit.ts.
export const smsCreditEntryTypeEnum = pgEnum('sms_credit_entry_type', [
	'charge', // outbound SMS send (negative amount)
	'refund', // failed/undeliverable send refunded (positive amount)
	'manual_topup', // PO manual credit add via /jafar (positive amount)
	'monthly_grant' // monthly included allowance, rollover (positive amount)
]);

// One row per org — live balance + PO-configured pricing/allowance.
export const orgSmsCredit = pgTable('org_sms_credit', {
	org_id: uuid('org_id')
		.primaryKey()
		.references(() => organizations.id, { onDelete: 'cascade' }),
	balance: numeric('balance', { precision: 12, scale: 4 }).notNull().default('0'),
	monthly_included_credit: numeric('monthly_included_credit', { precision: 12, scale: 4 })
		.notNull()
		.default('5.0000'),
	per_sms_cost: numeric('per_sms_cost', { precision: 12, scale: 4 }).notNull().default('0.1000'),
	last_monthly_grant_at: timestamp('last_monthly_grant_at', { withTimezone: true }),
	// PO-controlled (per org, via /jafar) display gate. When true, the contractor
	// Settings → SMS Credits page reveals the per-SMS price and an estimated
	// "messages remaining". Default false keeps the Blueprint's "no complexity
	// exposed to the contractor" stance — the PO opts an org in explicitly.
	show_cost_to_contractor: boolean('show_cost_to_contractor').notNull().default(false),
	// Set when balance first drops below 20% of monthly_included_credit; guards
	// the low-credit warning so it fires once per cycle. Cleared on monthly grant
	// and on manual top-up so a replenished org can be warned again next time.
	low_credit_notified_at: timestamp('low_credit_notified_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type OrgSmsCredit = InferSelectModel<typeof orgSmsCredit>;
export type NewOrgSmsCredit = InferInsertModel<typeof orgSmsCredit>;

// Append-only audit of every balance change. The UNIQUE idempotency_key is the
// no-double-deduction / no-double-refund guarantee (charge:{msgId},
// refund:{msgId}, monthly_grant:{orgId}:YYYY-MM, manual_topup:{uuid}).
// message_id is a soft reference (no FK) to avoid a circular schema import.
export const smsCreditLedger = pgTable(
	'sms_credit_ledger',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		entry_type: smsCreditEntryTypeEnum('entry_type').notNull(),
		amount: numeric('amount', { precision: 12, scale: 4 }).notNull(),
		balance_after: numeric('balance_after', { precision: 12, scale: 4 }).notNull(),
		message_id: uuid('message_id'),
		created_by: text('created_by'), // jafar admin id, or null for system/cron
		note: text('note'),
		idempotency_key: text('idempotency_key').notNull(),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('sms_credit_ledger_idempotency_key_uq').on(t.idempotency_key),
		index('sms_credit_ledger_org_created_idx').on(t.org_id, t.created_at.desc())
	]
);

export type SmsCreditLedger = InferSelectModel<typeof smsCreditLedger>;
export type NewSmsCreditLedger = InferInsertModel<typeof smsCreditLedger>;
