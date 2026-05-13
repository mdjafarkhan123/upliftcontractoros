import { pgTable, pgEnum, uuid, text, boolean, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export interface IntegrationStatus {
	[key: string]: unknown;
}

export const orgStatusEnum = pgEnum('org_status', [
	'active',
	'suspended',
	'pending_deletion',
	'deleted'
]);

export const memberRoleEnum = pgEnum('member_role', ['admin', 'manager', 'member']);

export const organizations = pgTable('organizations', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	trade_type: text('trade_type').notNull(),
	twilio_phone_number: text('twilio_phone_number').notNull(),
	status: orgStatusEnum('status').notNull().default('active'),
	plan: text('plan').notNull().default('starter'),
	stripe_restricted_key: text('stripe_restricted_key'),
	stripe_publishable_key: text('stripe_publishable_key'),
	stripe_webhook_secret: text('stripe_webhook_secret'),
	stripe_account_id: text('stripe_account_id'),
	stripe_connected_at: timestamp('stripe_connected_at', { withTimezone: true }),
	logo_url: text('logo_url'),
	primary_color: text('primary_color'),
	timezone: text('timezone').notNull().default('America/Chicago'),
	address: text('address'),
	city: text('city'),
	state: text('state'),
	zip: text('zip'),
	is_setup_complete: boolean('is_setup_complete').notNull().default(false),
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

	max_team_members: integer('max_team_members').notNull().default(3),
	max_monthly_sms: integer('max_monthly_sms').notNull().default(500),
	max_bulk_sms_per_day: integer('max_bulk_sms_per_day').notNull().default(50),
	max_ai_requests_per_month: integer('max_ai_requests_per_month').notNull().default(0),
	max_storage_gb: integer('max_storage_gb').notNull().default(5),
	max_automation_workflows: integer('max_automation_workflows').notNull().default(0),

	integration_status: jsonb('integration_status')
		.$type<IntegrationStatus>()
		.notNull()
		.default({}),
	feature_overrides_updated_at: timestamp('feature_overrides_updated_at', { withTimezone: true }),
	feature_flags_updated_by: uuid('feature_flags_updated_by').references((): any => orgMembers.id)
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

	// Module 4: Pipeline
	can_view_full_pipeline: boolean('can_view_full_pipeline').notNull().default(false),
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
	appointment_reminder_enabled: boolean('appointment_reminder_enabled').notNull().default(true),
	appointment_reminder_hours_before: integer('appointment_reminder_hours_before')
		.notNull()
		.default(24),
	appointment_reminder_message: text('appointment_reminder_message').notNull(),
	speed_to_lead_enabled: boolean('speed_to_lead_enabled').notNull().default(true),
	speed_to_lead_message: text('speed_to_lead_message').notNull(),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type AutomationSettings = InferSelectModel<typeof automationSettings>;
export type NewAutomationSettings = InferInsertModel<typeof automationSettings>;
