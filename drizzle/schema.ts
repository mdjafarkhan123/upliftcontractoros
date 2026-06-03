import {
	pgTable,
	index,
	foreignKey,
	pgPolicy,
	uuid,
	text,
	numeric,
	timestamp,
	uniqueIndex,
	unique,
	boolean,
	integer,
	date,
	check,
	jsonb,
	serial,
	pgEnum
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const addressLabel = pgEnum('address_label', ['billing', 'service', 'mailing', 'other']);
export const appointmentStatus = pgEnum('appointment_status', [
	'scheduled',
	'completed',
	'cancelled',
	'no_show'
]);
export const appointmentType = pgEnum('appointment_type', [
	'estimate',
	'job_start',
	'follow_up',
	'inspection',
	'other'
]);
export const automationJobStatus = pgEnum('automation_job_status', [
	'pending',
	'processing',
	'completed',
	'failed',
	'cancelled'
]);
export const automationJobType = pgEnum('automation_job_type', [
	'missed_call_textback',
	'speed_to_lead',
	'quote_followup',
	'invoice_reminder',
	'review_request',
	'appointment_reminder'
]);
export const contactStatus = pgEnum('contact_status', ['lead', 'customer', 'archived']);
export const conversationChannel = pgEnum('conversation_channel', [
	'sms',
	'missed_call',
	'email',
	'webchat'
]);
export const conversationStatus = pgEnum('conversation_status', ['open', 'closed', 'archived']);
export const growthFeedType = pgEnum('growth_feed_type', [
	'gbp_post',
	'seo',
	'social',
	'website',
	'blog',
	'review_response',
	'monthly_summary'
]);
export const invoiceStatus = pgEnum('invoice_status', [
	'draft',
	'sent',
	'partially_paid',
	'paid',
	'overdue',
	'cancelled'
]);
export const jobStatus = pgEnum('job_status', [
	'scheduled',
	'in_progress',
	'completed',
	'cancelled'
]);
export const leadSourceType = pgEnum('lead_source_type', [
	'website_form',
	'live_chat',
	'missed_call',
	'manual',
	'referral',
	'other'
]);
export const mediaPurposeTag = pgEnum('media_purpose_tag', [
	'job_photo',
	'before',
	'after',
	'marketing_asset',
	'quote_attachment',
	'invoice_attachment'
]);
export const mediaType = pgEnum('media_type', ['photo', 'pdf', 'attachment']);
export const memberRole = pgEnum('member_role', ['admin', 'manager', 'member']);
export const messageChannel = pgEnum('message_channel', ['sms', 'email', 'webchat']);
export const messageDirection = pgEnum('message_direction', ['inbound', 'outbound']);
export const messageStatus = pgEnum('message_status', [
	'sent',
	'delivered',
	'failed',
	'received',
	'queued',
	'bounced'
]);
export const orgStatus = pgEnum('org_status', [
	'active',
	'suspended',
	'pending_deletion',
	'deleted'
]);
export const outboxEventStatus = pgEnum('outbox_event_status', [
	'pending',
	'processing',
	'processed',
	'failed',
	'dead_lettered'
]);
export const paymentMethod = pgEnum('payment_method', [
	'stripe',
	'cash',
	'check',
	'bank_transfer',
	'other'
]);
export const quoteStatus = pgEnum('quote_status', [
	'draft',
	'sent',
	'viewed',
	'accepted',
	'declined',
	'expired'
]);
export const reviewRequestStatus = pgEnum('review_request_status', [
	'pending',
	'sent',
	'responded',
	'failed',
	'no_response'
]);

export const opportunities = pgTable(
	'opportunities',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		contactId: uuid('contact_id').notNull(),
		stageId: uuid('stage_id').notNull(),
		title: text().notNull(),
		value: numeric({ precision: 12, scale: 2 }),
		assignedTo: uuid('assigned_to'),
		lostReason: text('lost_reason'),
		closedAt: timestamp('closed_at', { withTimezone: true, mode: 'string' }),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_opportunities_assigned_to').using(
			'btree',
			table.assignedTo.asc().nullsLast().op('uuid_ops')
		),
		index('idx_opportunities_contact_id').using(
			'btree',
			table.contactId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_opportunities_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		index('idx_opportunities_stage_id').using(
			'btree',
			table.stageId.asc().nullsLast().op('uuid_ops')
		),
		foreignKey({
			columns: [table.assignedTo],
			foreignColumns: [orgMembers.id],
			name: 'opportunities_assigned_to_fkey'
		}),
		foreignKey({
			columns: [table.contactId],
			foreignColumns: [contacts.id],
			name: 'opportunities_contact_id_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'opportunities_org_id_fkey'
		}),
		foreignKey({
			columns: [table.stageId],
			foreignColumns: [pipelineStages.id],
			name: 'opportunities_stage_id_fkey'
		}),
		pgPolicy('opportunities: full pipeline access', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL) AND (( SELECT org_members.can_view_full_pipeline
   FROM org_members
  WHERE ((org_members.supabase_user_id = auth.uid()) AND (org_members.is_active = true) AND (org_members.deleted_at IS NULL))
 LIMIT 1) = true))`
		}),
		pgPolicy('opportunities: assigned member access', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated']
		})
	]
);

export const organizations = pgTable(
	'organizations',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		name: text().notNull(),
		slug: text().notNull(),
		tradeType: text('trade_type').notNull(),
		twilioPhoneNumber: text('twilio_phone_number').notNull(),
		status: orgStatus().default('active').notNull(),
		plan: text().default('starter').notNull(),
		stripeRestrictedKey: text('stripe_restricted_key'),
		stripePublishableKey: text('stripe_publishable_key'),
		stripeWebhookSecret: text('stripe_webhook_secret'),
		stripeAccountId: text('stripe_account_id'),
		stripeConnectedAt: timestamp('stripe_connected_at', { withTimezone: true, mode: 'string' }),
		logoUrl: text('logo_url'),
		primaryColor: text('primary_color'),
		timezone: text().default('America/Chicago').notNull(),
		address: text(),
		city: text(),
		state: text(),
		zip: text(),
		suspendedAt: timestamp('suspended_at', { withTimezone: true, mode: 'string' }),
		deletionScheduledAt: timestamp('deletion_scheduled_at', { withTimezone: true, mode: 'string' }),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		isSetupComplete: boolean('is_setup_complete').default(false).notNull()
	},
	(table) => [
		index('idx_organizations_status').using('btree', table.status.asc().nullsLast().op('enum_ops')),
		uniqueIndex('idx_organizations_twilio_phone').using(
			'btree',
			table.twilioPhoneNumber.asc().nullsLast().op('text_ops')
		),
		unique('organizations_slug_key').on(table.slug),
		pgPolicy('organizations: members select own org', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`(id = get_my_org_id())`
		})
	]
);

export const automationSettings = pgTable(
	'automation_settings',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		missedCallTextbackEnabled: boolean('missed_call_textback_enabled').default(true).notNull(),
		missedCallTextbackMessage: text('missed_call_textback_message')
			.default(
				"Hi! We missed your call. We'll be in touch shortly — or reply here and we'll get back to you right away."
			)
			.notNull(),
		quoteFollowupEnabled: boolean('quote_followup_enabled').default(true).notNull(),
		quoteFollowupDelay1Hours: integer('quote_followup_delay_1_hours').default(24).notNull(),
		quoteFollowupDelay2Hours: integer('quote_followup_delay_2_hours').default(72).notNull(),
		quoteFollowupMessage: text('quote_followup_message')
			.default(
				"Hi {contact_name}, just following up on the quote we sent. Any questions? We're happy to help."
			)
			.notNull(),
		invoiceReminderEnabled: boolean('invoice_reminder_enabled').default(true).notNull(),
		invoiceReminderDelayDays: integer('invoice_reminder_delay_days').default(3).notNull(),
		invoiceReminderMessage: text('invoice_reminder_message')
			.default(
				"Hi {contact_name}, just a reminder that your invoice is due. Please don't hesitate to reach out if you have any questions."
			)
			.notNull(),
		reviewFunnelEnabled: boolean('review_funnel_enabled').default(true).notNull(),
		reviewFunnelDelayHours: integer('review_funnel_delay_hours').default(2).notNull(),
		reviewFunnelMessage: text('review_funnel_message')
			.default(
				'Hi {contact_name}, thank you for choosing us! How did we do today? Reply with a number from 1–5.'
			)
			.notNull(),
		appointmentReminderEnabled: boolean('appointment_reminder_enabled').default(true).notNull(),
		appointmentReminderHoursBefore: integer('appointment_reminder_hours_before')
			.default(24)
			.notNull(),
		appointmentReminderMessage: text('appointment_reminder_message')
			.default(
				'Hi {contact_name}, just a reminder about your appointment tomorrow. Reply STOP to opt out.'
			)
			.notNull(),
		speedToLeadEnabled: boolean('speed_to_lead_enabled').default(true).notNull(),
		speedToLeadMessage: text('speed_to_lead_message')
			.default("Hi {contact_name}, thanks for reaching out! We'll get back to you shortly.")
			.notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		uniqueIndex('idx_automation_settings_org_id').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops')
		),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'automation_settings_org_id_fkey'
		}),
		pgPolicy('automation_settings: members select own org settings', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`(org_id = get_my_org_id())`
		})
	]
);

export const contactAddresses = pgTable(
	'contact_addresses',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		contactId: uuid('contact_id').notNull(),
		label: addressLabel().default('service').notNull(),
		addressLine1: text('address_line_1').notNull(),
		addressLine2: text('address_line_2'),
		city: text().notNull(),
		state: text().notNull(),
		zip: text().notNull(),
		isPrimary: boolean('is_primary').default(false).notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_contact_addresses_contact_id').using(
			'btree',
			table.contactId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_contact_addresses_org_id').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops')
		),
		uniqueIndex('idx_contact_addresses_primary')
			.using('btree', table.contactId.asc().nullsLast().op('uuid_ops'))
			.where(sql`((is_primary = true) AND (deleted_at IS NULL))`),
		foreignKey({
			columns: [table.contactId],
			foreignColumns: [contacts.id],
			name: 'contact_addresses_contact_id_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'contact_addresses_org_id_fkey'
		}),
		pgPolicy('contact_addresses: members select own org addresses', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL))`
		})
	]
);

export const pipelineStages = pgTable(
	'pipeline_stages',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		name: text().notNull(),
		color: text().notNull(),
		position: integer().notNull(),
		isDefault: boolean('is_default').default(false).notNull(),
		isWon: boolean('is_won').default(false).notNull(),
		isLost: boolean('is_lost').default(false).notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		uniqueIndex('idx_pipeline_stages_one_default')
			.using('btree', table.orgId.asc().nullsLast().op('uuid_ops'))
			.where(sql`((is_default = true) AND (deleted_at IS NULL))`),
		uniqueIndex('idx_pipeline_stages_one_lost')
			.using('btree', table.orgId.asc().nullsLast().op('uuid_ops'))
			.where(sql`((is_lost = true) AND (deleted_at IS NULL))`),
		uniqueIndex('idx_pipeline_stages_one_won')
			.using('btree', table.orgId.asc().nullsLast().op('uuid_ops'))
			.where(sql`((is_won = true) AND (deleted_at IS NULL))`),
		index('idx_pipeline_stages_org_id').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops')
		),
		uniqueIndex('idx_pipeline_stages_position')
			.using(
				'btree',
				table.orgId.asc().nullsLast().op('int4_ops'),
				table.position.asc().nullsLast().op('int4_ops')
			)
			.where(sql`(deleted_at IS NULL)`),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'pipeline_stages_org_id_fkey'
		}),
		pgPolicy('pipeline_stages: members select own org stages', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL))`
		})
	]
);

export const orgMembers = pgTable(
	'org_members',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		supabaseUserId: uuid('supabase_user_id').notNull(),
		email: text().notNull(),
		fullName: text('full_name').notNull(),
		avatarUrl: text('avatar_url'),
		role: memberRole().notNull(),
		isActive: boolean('is_active').default(true).notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		canViewDashboard: boolean('can_view_dashboard').default(false).notNull(),
		canViewRevenue: boolean('can_view_revenue').default(false).notNull(),
		canViewPipelineSnapshot: boolean('can_view_pipeline_snapshot').default(false).notNull(),
		canViewAllConversations: boolean('can_view_all_conversations').default(false).notNull(),
		canViewAssignedConversations: boolean('can_view_assigned_conversations')
			.default(false)
			.notNull(),
		canSendMessages: boolean('can_send_messages').default(false).notNull(),
		canDeleteConversations: boolean('can_delete_conversations').default(false).notNull(),
		canViewAllContacts: boolean('can_view_all_contacts').default(false).notNull(),
		canCreateContacts: boolean('can_create_contacts').default(false).notNull(),
		canEditContacts: boolean('can_edit_contacts').default(false).notNull(),
		canDeleteContacts: boolean('can_delete_contacts').default(false).notNull(),
		canViewFullPipeline: boolean('can_view_full_pipeline').default(false).notNull(),
		canMovePipelineStages: boolean('can_move_pipeline_stages').default(false).notNull(),
		canCreateOpportunities: boolean('can_create_opportunities').default(false).notNull(),
		canViewAllQuotes: boolean('can_view_all_quotes').default(false).notNull(),
		canCreateQuotes: boolean('can_create_quotes').default(false).notNull(),
		canSendQuotes: boolean('can_send_quotes').default(false).notNull(),
		canEditQuotes: boolean('can_edit_quotes').default(false).notNull(),
		canDeleteQuotes: boolean('can_delete_quotes').default(false).notNull(),
		canViewAllInvoices: boolean('can_view_all_invoices').default(false).notNull(),
		canCreateInvoices: boolean('can_create_invoices').default(false).notNull(),
		canSendInvoices: boolean('can_send_invoices').default(false).notNull(),
		canRecordPayments: boolean('can_record_payments').default(false).notNull(),
		canDeleteInvoices: boolean('can_delete_invoices').default(false).notNull(),
		canViewAllAppointments: boolean('can_view_all_appointments').default(false).notNull(),
		canViewAssignedAppointments: boolean('can_view_assigned_appointments').default(false).notNull(),
		canCreateAppointments: boolean('can_create_appointments').default(false).notNull(),
		canRescheduleAppointments: boolean('can_reschedule_appointments').default(false).notNull(),
		canViewReviews: boolean('can_view_reviews').default(false).notNull(),
		canSendReviewRequests: boolean('can_send_review_requests').default(false).notNull(),
		canViewNegativeFeedback: boolean('can_view_negative_feedback').default(false).notNull(),
		canViewGrowthFeed: boolean('can_view_growth_feed').default(false).notNull(),
		canViewAllFiles: boolean('can_view_all_files').default(false).notNull(),
		canUploadFiles: boolean('can_upload_files').default(false).notNull(),
		canDeleteFiles: boolean('can_delete_files').default(false).notNull(),
		canViewTeamMembers: boolean('can_view_team_members').default(false).notNull(),
		canCreateTeamMembers: boolean('can_create_team_members').default(false).notNull(),
		canEditTeamMembers: boolean('can_edit_team_members').default(false).notNull(),
		canDeleteTeamMembers: boolean('can_delete_team_members').default(false).notNull()
	},
	(table) => [
		uniqueIndex('idx_org_members_org_email')
			.using(
				'btree',
				table.orgId.asc().nullsLast().op('uuid_ops'),
				table.email.asc().nullsLast().op('text_ops')
			)
			.where(sql`(deleted_at IS NULL)`),
		index('idx_org_members_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		uniqueIndex('idx_org_members_supabase_user_id').using(
			'btree',
			table.supabaseUserId.asc().nullsLast().op('uuid_ops')
		),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'org_members_org_id_fkey'
		}),
		pgPolicy('org_members: members select own org roster', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (is_active = true) AND (deleted_at IS NULL))`
		})
	]
);

export const contacts = pgTable(
	'contacts',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		fullName: text('full_name').notNull(),
		email: text(),
		phone: text().notNull(),
		tags: text().array().default(['']).notNull(),
		status: contactStatus().default('lead').notNull(),
		assignedTo: uuid('assigned_to'),
		smsOptOut: boolean('sms_opt_out').default(false).notNull(),
		smsOptOutAt: timestamp('sms_opt_out_at', { withTimezone: true, mode: 'string' }),
		smsOptOutSource: text('sms_opt_out_source'),
		smsOptedInAt: timestamp('sms_opted_in_at', { withTimezone: true, mode: 'string' }),
		leadSource: leadSourceType('lead_source').default('manual').notNull(),
		notes: text(),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_contacts_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		uniqueIndex('idx_contacts_org_phone').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops'),
			table.phone.asc().nullsLast().op('text_ops')
		),
		index('idx_contacts_status').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops'),
			table.status.asc().nullsLast().op('uuid_ops')
		),
		index('idx_contacts_tags').using('gin', table.tags.asc().nullsLast().op('array_ops')),
		foreignKey({
			columns: [table.assignedTo],
			foreignColumns: [orgMembers.id],
			name: 'contacts_assigned_to_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'contacts_org_id_fkey'
		}),
		pgPolicy('contacts: members select own org contacts', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL))`
		})
	]
);

export const contactNotes = pgTable(
	'contact_notes',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		contactId: uuid('contact_id').notNull(),
		authorId: uuid('author_id').notNull(),
		content: text().notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_contact_notes_contact_id').using(
			'btree',
			table.contactId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_contact_notes_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		foreignKey({
			columns: [table.authorId],
			foreignColumns: [orgMembers.id],
			name: 'contact_notes_author_id_fkey'
		}),
		foreignKey({
			columns: [table.contactId],
			foreignColumns: [contacts.id],
			name: 'contact_notes_contact_id_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'contact_notes_org_id_fkey'
		}),
		pgPolicy('contact_notes: members select own org notes', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL))`
		})
	]
);

export const jobs = pgTable(
	'jobs',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		opportunityId: uuid('opportunity_id').notNull(),
		contactId: uuid('contact_id').notNull(),
		title: text().notNull(),
		status: jobStatus().default('scheduled').notNull(),
		assignedTo: uuid('assigned_to'),
		notes: text(),
		scopeOfWork: text('scope_of_work'),
		serviceAddressLine1: text('service_address_line_1'),
		serviceAddressLine2: text('service_address_line_2'),
		serviceAddressCity: text('service_address_city'),
		serviceAddressState: text('service_address_state'),
		serviceAddressZip: text('service_address_zip'),
		scheduledStart: timestamp('scheduled_start', { withTimezone: true, mode: 'string' }),
		scheduledEnd: timestamp('scheduled_end', { withTimezone: true, mode: 'string' }),
		completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
		cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'string' }),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_jobs_assigned_to').using('btree', table.assignedTo.asc().nullsLast().op('uuid_ops')),
		index('idx_jobs_contact_id').using('btree', table.contactId.asc().nullsLast().op('uuid_ops')),
		uniqueIndex('idx_jobs_opportunity_id').using(
			'btree',
			table.opportunityId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_jobs_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		index('idx_jobs_scheduled_start').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops'),
			table.scheduledStart.asc().nullsLast().op('uuid_ops')
		),
		index('idx_jobs_status').using(
			'btree',
			table.orgId.asc().nullsLast().op('enum_ops'),
			table.status.asc().nullsLast().op('enum_ops')
		),
		foreignKey({
			columns: [table.assignedTo],
			foreignColumns: [orgMembers.id],
			name: 'jobs_assigned_to_fkey'
		}),
		foreignKey({
			columns: [table.contactId],
			foreignColumns: [contacts.id],
			name: 'jobs_contact_id_fkey'
		}),
		foreignKey({
			columns: [table.opportunityId],
			foreignColumns: [opportunities.id],
			name: 'jobs_opportunity_id_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'jobs_org_id_fkey'
		}),
		pgPolicy('jobs: full job list access', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL) AND (( SELECT org_members.can_view_full_pipeline
   FROM org_members
  WHERE ((org_members.supabase_user_id = auth.uid()) AND (org_members.is_active = true) AND (org_members.deleted_at IS NULL))
 LIMIT 1) = true))`
		}),
		pgPolicy('jobs: assigned member access', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated']
		})
	]
);

export const conversations = pgTable(
	'conversations',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		contactId: uuid('contact_id').notNull(),
		channel: conversationChannel().notNull(),
		status: conversationStatus().default('open').notNull(),
		subject: text(),
		assignedTo: uuid('assigned_to'),
		lastMessageAt: timestamp('last_message_at', { withTimezone: true, mode: 'string' }),
		unreadCount: integer('unread_count').default(0).notNull(),
		tags: text().array().default(['']).notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_conversations_assigned_to').using(
			'btree',
			table.assignedTo.asc().nullsLast().op('uuid_ops')
		),
		index('idx_conversations_contact_id').using(
			'btree',
			table.contactId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_conversations_last_message_at').using(
			'btree',
			table.orgId.asc().nullsLast().op('timestamptz_ops'),
			table.lastMessageAt.desc().nullsFirst().op('uuid_ops')
		),
		uniqueIndex('idx_conversations_open_contact_channel')
			.using(
				'btree',
				table.contactId.asc().nullsLast().op('enum_ops'),
				table.channel.asc().nullsLast().op('uuid_ops')
			)
			.where(sql`((deleted_at IS NULL) AND (status = 'open'::conversation_status))`),
		index('idx_conversations_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		index('idx_conversations_status').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops'),
			table.status.asc().nullsLast().op('uuid_ops')
		),
		foreignKey({
			columns: [table.assignedTo],
			foreignColumns: [orgMembers.id],
			name: 'conversations_assigned_to_fkey'
		}),
		foreignKey({
			columns: [table.contactId],
			foreignColumns: [contacts.id],
			name: 'conversations_contact_id_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'conversations_org_id_fkey'
		}),
		pgPolicy('conversations: full inbox access', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL) AND (( SELECT org_members.can_view_all_conversations
   FROM org_members
  WHERE ((org_members.supabase_user_id = auth.uid()) AND (org_members.is_active = true) AND (org_members.deleted_at IS NULL))
 LIMIT 1) = true))`
		}),
		pgPolicy('conversations: assigned member access', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated']
		})
	]
);

export const messages = pgTable(
	'messages',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		conversationId: uuid('conversation_id').notNull(),
		direction: messageDirection().notNull(),
		channel: messageChannel().notNull(),
		body: text(),
		isInternalNote: boolean('is_internal_note').default(false).notNull(),
		mediaUrls: text('media_urls').array(),
		status: messageStatus().notNull(),
		twilioMessageSid: text('twilio_message_sid'),
		sentBy: uuid('sent_by'),
		sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
		readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_messages_conversation_id').using(
			'btree',
			table.conversationId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_messages_direction_read').using(
			'btree',
			table.conversationId.asc().nullsLast().op('timestamptz_ops'),
			table.direction.asc().nullsLast().op('uuid_ops'),
			table.readAt.asc().nullsLast().op('enum_ops')
		),
		index('idx_messages_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		uniqueIndex('idx_messages_twilio_sid')
			.using('btree', table.twilioMessageSid.asc().nullsLast().op('text_ops'))
			.where(sql`(twilio_message_sid IS NOT NULL)`),
		foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: 'messages_conversation_id_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'messages_org_id_fkey'
		}),
		foreignKey({
			columns: [table.sentBy],
			foreignColumns: [orgMembers.id],
			name: 'messages_sent_by_fkey'
		}),
		pgPolicy('messages: members select own org messages', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`(org_id = get_my_org_id())`
		})
	]
);

export const quotes = pgTable(
	'quotes',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		contactId: uuid('contact_id').notNull(),
		opportunityId: uuid('opportunity_id'),
		issuedBy: uuid('issued_by'),
		quoteNumber: integer('quote_number').notNull(),
		title: text().notNull(),
		status: quoteStatus().default('draft').notNull(),
		subtotal: numeric({ precision: 12, scale: 2 }).default('0').notNull(),
		taxRate: numeric('tax_rate', { precision: 5, scale: 4 }).default('0').notNull(),
		taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).default('0').notNull(),
		total: numeric({ precision: 12, scale: 2 }).default('0').notNull(),
		depositRequired: boolean('deposit_required').default(false).notNull(),
		depositAmount: numeric('deposit_amount', { precision: 12, scale: 2 }),
		notes: text(),
		internalNotes: text('internal_notes'),
		publicTokenHash: text('public_token_hash').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
		sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
		viewedAt: timestamp('viewed_at', { withTimezone: true, mode: 'string' }),
		acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'string' }),
		declinedAt: timestamp('declined_at', { withTimezone: true, mode: 'string' }),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_quotes_contact_id').using('btree', table.contactId.asc().nullsLast().op('uuid_ops')),
		index('idx_quotes_opportunity_id').using(
			'btree',
			table.opportunityId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_quotes_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		uniqueIndex('idx_quotes_org_number').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops'),
			table.quoteNumber.asc().nullsLast().op('uuid_ops')
		),
		index('idx_quotes_status').using(
			'btree',
			table.orgId.asc().nullsLast().op('enum_ops'),
			table.status.asc().nullsLast().op('enum_ops')
		),
		uniqueIndex('idx_quotes_token_hash').using(
			'btree',
			table.publicTokenHash.asc().nullsLast().op('text_ops')
		),
		foreignKey({
			columns: [table.contactId],
			foreignColumns: [contacts.id],
			name: 'quotes_contact_id_fkey'
		}),
		foreignKey({
			columns: [table.issuedBy],
			foreignColumns: [orgMembers.id],
			name: 'quotes_issued_by_fkey'
		}),
		foreignKey({
			columns: [table.opportunityId],
			foreignColumns: [opportunities.id],
			name: 'quotes_opportunity_id_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'quotes_org_id_fkey'
		}),
		pgPolicy('quotes: members select own org quotes', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL))`
		})
	]
);

export const quoteLineItems = pgTable(
	'quote_line_items',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		quoteId: uuid('quote_id').notNull(),
		description: text().notNull(),
		quantity: numeric({ precision: 10, scale: 2 }).default('1').notNull(),
		unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
		total: numeric({ precision: 12, scale: 2 }).notNull(),
		position: integer().default(0).notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_quote_line_items_org_id').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_quote_line_items_quote_id').using(
			'btree',
			table.quoteId.asc().nullsLast().op('uuid_ops')
		),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'quote_line_items_org_id_fkey'
		}),
		foreignKey({
			columns: [table.quoteId],
			foreignColumns: [quotes.id],
			name: 'quote_line_items_quote_id_fkey'
		}),
		pgPolicy('quote_line_items: members select own org line items', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL))`
		})
	]
);

export const quoteViews = pgTable(
	'quote_views',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		quoteId: uuid('quote_id').notNull(),
		ipHash: text('ip_hash'),
		userAgentHash: text('user_agent_hash'),
		viewedAt: timestamp('viewed_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
		notificationSent: boolean('notification_sent').default(false).notNull(),
		notificationSentAt: timestamp('notification_sent_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_quote_views_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		index('idx_quote_views_quote_id').using(
			'btree',
			table.quoteId.asc().nullsLast().op('uuid_ops')
		),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'quote_views_org_id_fkey'
		}),
		foreignKey({
			columns: [table.quoteId],
			foreignColumns: [quotes.id],
			name: 'quote_views_quote_id_fkey'
		}),
		pgPolicy('quote_views: members select own org quote views', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`(org_id = get_my_org_id())`
		})
	]
);

export const quoteTemplates = pgTable(
	'quote_templates',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		name: text().notNull(),
		description: text(),
		createdBy: uuid('created_by'),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_quote_templates_org_id').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops')
		),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [orgMembers.id],
			name: 'quote_templates_created_by_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'quote_templates_org_id_fkey'
		}),
		pgPolicy('quote_templates: members select own org templates', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL))`
		})
	]
);

export const quoteTemplateLineItems = pgTable(
	'quote_template_line_items',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		templateId: uuid('template_id').notNull(),
		description: text().notNull(),
		quantity: numeric({ precision: 10, scale: 2 }).default('1').notNull(),
		unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
		total: numeric({ precision: 12, scale: 2 }).notNull(),
		position: integer().default(0).notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_quote_template_line_items_org_id').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_quote_template_line_items_template_id').using(
			'btree',
			table.templateId.asc().nullsLast().op('uuid_ops')
		),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'quote_template_line_items_org_id_fkey'
		}),
		foreignKey({
			columns: [table.templateId],
			foreignColumns: [quoteTemplates.id],
			name: 'quote_template_line_items_template_id_fkey'
		}),
		pgPolicy('quote_template_line_items: members select own org template item', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL))`
		})
	]
);

export const invoices = pgTable(
	'invoices',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		contactId: uuid('contact_id').notNull(),
		jobId: uuid('job_id'),
		opportunityId: uuid('opportunity_id'),
		quoteId: uuid('quote_id'),
		issuedBy: uuid('issued_by'),
		invoiceNumber: integer('invoice_number').notNull(),
		title: text().notNull(),
		status: invoiceStatus().default('draft').notNull(),
		subtotal: numeric({ precision: 12, scale: 2 }).default('0').notNull(),
		taxRate: numeric('tax_rate', { precision: 5, scale: 4 }).default('0').notNull(),
		taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).default('0').notNull(),
		total: numeric({ precision: 12, scale: 2 }).default('0').notNull(),
		amountPaid: numeric('amount_paid', { precision: 12, scale: 2 }).default('0').notNull(),
		amountDue: numeric('amount_due', { precision: 12, scale: 2 }).default('0').notNull(),
		notes: text(),
		dueDate: date('due_date'),
		stripePaymentLinkUrl: text('stripe_payment_link_url'),
		sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
		paidAt: timestamp('paid_at', { withTimezone: true, mode: 'string' }),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_invoices_contact_id').using(
			'btree',
			table.contactId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_invoices_due_date').using(
			'btree',
			table.orgId.asc().nullsLast().op('date_ops'),
			table.dueDate.asc().nullsLast().op('date_ops')
		),
		index('idx_invoices_job_id').using('btree', table.jobId.asc().nullsLast().op('uuid_ops')),
		index('idx_invoices_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		uniqueIndex('idx_invoices_org_number').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops'),
			table.invoiceNumber.asc().nullsLast().op('int4_ops')
		),
		index('idx_invoices_status').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops'),
			table.status.asc().nullsLast().op('enum_ops')
		),
		foreignKey({
			columns: [table.contactId],
			foreignColumns: [contacts.id],
			name: 'invoices_contact_id_fkey'
		}),
		foreignKey({
			columns: [table.issuedBy],
			foreignColumns: [orgMembers.id],
			name: 'invoices_issued_by_fkey'
		}),
		foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: 'invoices_job_id_fkey'
		}),
		foreignKey({
			columns: [table.opportunityId],
			foreignColumns: [opportunities.id],
			name: 'invoices_opportunity_id_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'invoices_org_id_fkey'
		}),
		foreignKey({
			columns: [table.quoteId],
			foreignColumns: [quotes.id],
			name: 'invoices_quote_id_fkey'
		}),
		pgPolicy('invoices: members select own org invoices', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL))`
		})
	]
);

export const invoiceLineItems = pgTable(
	'invoice_line_items',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		invoiceId: uuid('invoice_id').notNull(),
		description: text().notNull(),
		quantity: numeric({ precision: 10, scale: 2 }).default('1').notNull(),
		unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
		total: numeric({ precision: 12, scale: 2 }).notNull(),
		position: integer().default(0).notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_invoice_line_items_invoice_id').using(
			'btree',
			table.invoiceId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_invoice_line_items_org_id').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops')
		),
		foreignKey({
			columns: [table.invoiceId],
			foreignColumns: [invoices.id],
			name: 'invoice_line_items_invoice_id_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'invoice_line_items_org_id_fkey'
		}),
		pgPolicy('invoice_line_items: members select own org line items', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL))`
		})
	]
);

export const payments = pgTable(
	'payments',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		invoiceId: uuid('invoice_id').notNull(),
		amount: numeric({ precision: 12, scale: 2 }).notNull(),
		paymentMethod: paymentMethod('payment_method').notNull(),
		stripePaymentIntentId: text('stripe_payment_intent_id'),
		notes: text(),
		recordedBy: uuid('recorded_by'),
		paidAt: timestamp('paid_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_payments_invoice_id').using(
			'btree',
			table.invoiceId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_payments_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		uniqueIndex('idx_payments_stripe_intent')
			.using('btree', table.stripePaymentIntentId.asc().nullsLast().op('text_ops'))
			.where(sql`(stripe_payment_intent_id IS NOT NULL)`),
		foreignKey({
			columns: [table.invoiceId],
			foreignColumns: [invoices.id],
			name: 'payments_invoice_id_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'payments_org_id_fkey'
		}),
		foreignKey({
			columns: [table.recordedBy],
			foreignColumns: [orgMembers.id],
			name: 'payments_recorded_by_fkey'
		}),
		pgPolicy('payments: members select own org payments', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`(org_id = get_my_org_id())`
		})
	]
);

export const appointments = pgTable(
	'appointments',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		contactId: uuid('contact_id').notNull(),
		jobId: uuid('job_id'),
		assignedTo: uuid('assigned_to'),
		type: appointmentType().notNull(),
		status: appointmentStatus().default('scheduled').notNull(),
		title: text().notNull(),
		scheduledStart: timestamp('scheduled_start', { withTimezone: true, mode: 'string' }).notNull(),
		scheduledEnd: timestamp('scheduled_end', { withTimezone: true, mode: 'string' }),
		location: text(),
		notes: text(),
		reminder24HSent: boolean('reminder_24h_sent').default(false).notNull(),
		reminder1HSent: boolean('reminder_1h_sent').default(false).notNull(),
		cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'string' }),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_appointments_assigned_to').using(
			'btree',
			table.assignedTo.asc().nullsLast().op('uuid_ops')
		),
		index('idx_appointments_contact_id').using(
			'btree',
			table.contactId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_appointments_job_id').using('btree', table.jobId.asc().nullsLast().op('uuid_ops')),
		index('idx_appointments_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		index('idx_appointments_reminders')
			.using('btree', table.scheduledStart.asc().nullsLast().op('timestamptz_ops'))
			.where(sql`((reminder_24h_sent = false) OR (reminder_1h_sent = false))`),
		index('idx_appointments_scheduled_start').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops'),
			table.scheduledStart.asc().nullsLast().op('timestamptz_ops')
		),
		foreignKey({
			columns: [table.assignedTo],
			foreignColumns: [orgMembers.id],
			name: 'appointments_assigned_to_fkey'
		}),
		foreignKey({
			columns: [table.contactId],
			foreignColumns: [contacts.id],
			name: 'appointments_contact_id_fkey'
		}),
		foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: 'appointments_job_id_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'appointments_org_id_fkey'
		}),
		pgPolicy('appointments: full appointment list access', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL) AND (( SELECT org_members.can_view_all_appointments
   FROM org_members
  WHERE ((org_members.supabase_user_id = auth.uid()) AND (org_members.is_active = true) AND (org_members.deleted_at IS NULL))
 LIMIT 1) = true))`
		}),
		pgPolicy('appointments: assigned member access', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated']
		})
	]
);

export const reviewRequests = pgTable(
	'review_requests',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		jobId: uuid('job_id').notNull(),
		contactId: uuid('contact_id').notNull(),
		status: reviewRequestStatus().default('pending').notNull(),
		sentByAutomation: boolean('sent_by_automation').default(false).notNull(),
		sentByMemberId: uuid('sent_by_member_id'),
		responseScore: integer('response_score'),
		sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
		respondedAt: timestamp('responded_at', { withTimezone: true, mode: 'string' }),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_review_requests_contact_id').using(
			'btree',
			table.contactId.asc().nullsLast().op('uuid_ops')
		),
		uniqueIndex('idx_review_requests_job_id').using(
			'btree',
			table.jobId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_review_requests_org_id').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops')
		),
		foreignKey({
			columns: [table.contactId],
			foreignColumns: [contacts.id],
			name: 'review_requests_contact_id_fkey'
		}),
		foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: 'review_requests_job_id_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'review_requests_org_id_fkey'
		}),
		foreignKey({
			columns: [table.sentByMemberId],
			foreignColumns: [orgMembers.id],
			name: 'review_requests_sent_by_member_id_fkey'
		}),
		pgPolicy('review_requests: members select own org review requests', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL))`
		}),
		check(
			'review_requests_response_score_check',
			sql`(response_score >= 1) AND (response_score <= 5)`
		)
	]
);

export const reviews = pgTable(
	'reviews',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		jobId: uuid('job_id').notNull(),
		contactId: uuid('contact_id').notNull(),
		reviewRequestId: uuid('review_request_id'),
		score: integer().notNull(),
		platform: text(),
		body: text(),
		reviewUrl: text('review_url'),
		googleReviewLinkSent: boolean('google_review_link_sent').default(false).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_reviews_contact_id').using(
			'btree',
			table.contactId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_reviews_job_id').using('btree', table.jobId.asc().nullsLast().op('uuid_ops')),
		index('idx_reviews_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		foreignKey({
			columns: [table.contactId],
			foreignColumns: [contacts.id],
			name: 'reviews_contact_id_fkey'
		}),
		foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: 'reviews_job_id_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'reviews_org_id_fkey'
		}),
		foreignKey({
			columns: [table.reviewRequestId],
			foreignColumns: [reviewRequests.id],
			name: 'reviews_review_request_id_fkey'
		}),
		pgPolicy('reviews: members select own org reviews', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`(org_id = get_my_org_id())`
		}),
		check('reviews_score_check', sql`(score >= 4) AND (score <= 5)`)
	]
);

export const privateFeedback = pgTable(
	'private_feedback',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		jobId: uuid('job_id').notNull(),
		contactId: uuid('contact_id').notNull(),
		reviewRequestId: uuid('review_request_id'),
		score: integer().notNull(),
		body: text(),
		isResolved: boolean('is_resolved').default(false).notNull(),
		resolvedBy: uuid('resolved_by'),
		resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'string' }),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_private_feedback_job_id').using(
			'btree',
			table.jobId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_private_feedback_org_id').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops')
		),
		foreignKey({
			columns: [table.contactId],
			foreignColumns: [contacts.id],
			name: 'private_feedback_contact_id_fkey'
		}),
		foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: 'private_feedback_job_id_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'private_feedback_org_id_fkey'
		}),
		foreignKey({
			columns: [table.resolvedBy],
			foreignColumns: [orgMembers.id],
			name: 'private_feedback_resolved_by_fkey'
		}),
		foreignKey({
			columns: [table.reviewRequestId],
			foreignColumns: [reviewRequests.id],
			name: 'private_feedback_review_request_id_fkey'
		}),
		pgPolicy('private_feedback: members select own org feedback', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL))`
		}),
		check('private_feedback_score_check', sql`(score >= 1) AND (score <= 3)`)
	]
);

export const media = pgTable(
	'media',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		uploadedBy: uuid('uploaded_by'),
		jobId: uuid('job_id'),
		quoteId: uuid('quote_id'),
		invoiceId: uuid('invoice_id'),
		r2Key: text('r2_key').notNull(),
		thumbnailKey: text('thumbnail_key'),
		webKey: text('web_key'),
		originalFilename: text('original_filename').notNull(),
		fileSizeBytes: integer('file_size_bytes').notNull(),
		mediaType: mediaType('media_type').notNull(),
		mimeType: text('mime_type').notNull(),
		purposeTag: mediaPurposeTag('purpose_tag').notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_media_invoice')
			.using('btree', table.invoiceId.asc().nullsLast().op('uuid_ops'))
			.where(sql`(invoice_id IS NOT NULL)`),
		index('idx_media_job')
			.using('btree', table.jobId.asc().nullsLast().op('uuid_ops'))
			.where(sql`(job_id IS NOT NULL)`),
		index('idx_media_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		index('idx_media_purpose_tag').using(
			'btree',
			table.orgId.asc().nullsLast().op('enum_ops'),
			table.purposeTag.asc().nullsLast().op('enum_ops')
		),
		index('idx_media_quote')
			.using('btree', table.quoteId.asc().nullsLast().op('uuid_ops'))
			.where(sql`(quote_id IS NOT NULL)`),
		index('idx_media_uploaded_by').using(
			'btree',
			table.uploadedBy.asc().nullsLast().op('uuid_ops')
		),
		foreignKey({
			columns: [table.invoiceId],
			foreignColumns: [invoices.id],
			name: 'media_invoice_id_fkey'
		}),
		foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: 'media_job_id_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'media_org_id_fkey'
		}),
		foreignKey({
			columns: [table.quoteId],
			foreignColumns: [quotes.id],
			name: 'media_quote_id_fkey'
		}),
		foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [orgMembers.id],
			name: 'media_uploaded_by_fkey'
		}),
		pgPolicy('media: members select own org media metadata', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`((org_id = get_my_org_id()) AND (deleted_at IS NULL))`
		}),
		check(
			'media_must_have_parent',
			sql`(job_id IS NOT NULL) OR (quote_id IS NOT NULL) OR (invoice_id IS NOT NULL)`
		)
	]
);

export const growthFeedItems = pgTable(
	'growth_feed_items',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		type: growthFeedType().notNull(),
		title: text().notNull(),
		body: text().notNull(),
		mediaUrl: text('media_url'),
		isMonthlySummary: boolean('is_monthly_summary').default(false).notNull(),
		publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_growth_feed_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		index('idx_growth_feed_published_at').using(
			'btree',
			table.orgId.asc().nullsLast().op('timestamptz_ops'),
			table.publishedAt.desc().nullsFirst().op('timestamptz_ops')
		),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'growth_feed_items_org_id_fkey'
		}),
		pgPolicy('growth_feed_items: members select own org feed', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`(org_id = get_my_org_id())`
		})
	]
);

export const internalActivityLog = pgTable(
	'internal_activity_log',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		authorId: text('author_id').notNull(),
		activityType: text('activity_type').notNull(),
		title: text().notNull(),
		body: text(),
		metadata: jsonb(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_internal_activity_log_created_at').using(
			'btree',
			table.orgId.asc().nullsLast().op('timestamptz_ops'),
			table.createdAt.desc().nullsFirst().op('timestamptz_ops')
		),
		index('idx_internal_activity_log_org_id').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops')
		),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'internal_activity_log_org_id_fkey'
		})
	]
);

export const automationJobs = pgTable(
	'automation_jobs',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		type: automationJobType().notNull(),
		resourceType: text('resource_type').notNull(),
		resourceId: uuid('resource_id').notNull(),
		bullJobId: text('bull_job_id').notNull(),
		status: automationJobStatus().default('pending').notNull(),
		attempts: integer().default(0).notNull(),
		lastError: text('last_error'),
		scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'string' }),
		startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }),
		completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
		failedAt: timestamp('failed_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_automation_jobs_org_id').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops')
		),
		index('idx_automation_jobs_resource').using(
			'btree',
			table.resourceType.asc().nullsLast().op('text_ops'),
			table.resourceId.asc().nullsLast().op('text_ops')
		),
		index('idx_automation_jobs_status').using(
			'btree',
			table.status.asc().nullsLast().op('enum_ops')
		),
		index('idx_automation_jobs_type').using(
			'btree',
			table.type.asc().nullsLast().op('enum_ops'),
			table.status.asc().nullsLast().op('enum_ops')
		),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'automation_jobs_org_id_fkey'
		})
	]
);

export const outboxEvents = pgTable(
	'outbox_events',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id'),
		eventType: text('event_type').notNull(),
		eventVersion: integer('event_version').default(1).notNull(),
		resourceType: text('resource_type').notNull(),
		resourceId: uuid('resource_id').notNull(),
		payload: jsonb().notNull(),
		status: outboxEventStatus().default('pending').notNull(),
		attempts: integer().default(0).notNull(),
		maxAttempts: integer('max_attempts').default(3).notNull(),
		sequence: serial().notNull(),
		availableAt: timestamp('available_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		processedAt: timestamp('processed_at', { withTimezone: true, mode: 'string' }),
		deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true, mode: 'string' }),
		lastError: text('last_error'),
		idempotencyKey: text('idempotency_key').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('idx_outbox_events_dead_lettered')
			.using(
				'btree',
				table.orgId.asc().nullsLast().op('uuid_ops'),
				table.deadLetteredAt.asc().nullsLast().op('uuid_ops')
			)
			.where(sql`(status = 'dead_lettered'::outbox_event_status)`),
		uniqueIndex('idx_outbox_events_idempotency_key').using(
			'btree',
			table.idempotencyKey.asc().nullsLast().op('text_ops')
		),
		index('idx_outbox_events_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		index('idx_outbox_events_worker_poll')
			.using(
				'btree',
				table.status.asc().nullsLast().op('timestamptz_ops'),
				table.availableAt.asc().nullsLast().op('enum_ops')
			)
			.where(sql`(status = 'pending'::outbox_event_status)`),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'outbox_events_org_id_fkey'
		})
	]
);

export const orgCounters = pgTable(
	'org_counters',
	{
		orgId: uuid('org_id').primaryKey().notNull(),
		nextQuoteNumber: integer('next_quote_number').default(1).notNull(),
		nextInvoiceNumber: integer('next_invoice_number').default(1).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		uniqueIndex('idx_org_counters_org_id').using(
			'btree',
			table.orgId.asc().nullsLast().op('uuid_ops')
		),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'org_counters_org_id_fkey'
		})
	]
);

export const notifications = pgTable(
	'notifications',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		orgId: uuid('org_id').notNull(),
		memberId: uuid('member_id').notNull(),
		type: text().notNull(),
		title: text().notNull(),
		body: text(),
		resourceType: text('resource_type'),
		resourceId: uuid('resource_id'),
		readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.defaultNow()
			.notNull(),
		idempotencyKey: text('idempotency_key')
	},
	(table) => [
		index('idx_notifications_created_at').using(
			'btree',
			table.createdAt.asc().nullsLast().op('timestamptz_ops')
		),
		uniqueIndex('idx_notifications_idempotency_key')
			.using('btree', table.idempotencyKey.asc().nullsLast().op('text_ops'))
			.where(sql`(idempotency_key IS NOT NULL)`),
		index('idx_notifications_member_id').using(
			'btree',
			table.memberId.asc().nullsLast().op('uuid_ops'),
			table.createdAt.desc().nullsFirst().op('timestamptz_ops')
		),
		index('idx_notifications_org_id').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
		index('idx_notifications_unread')
			.using(
				'btree',
				table.memberId.asc().nullsLast().op('timestamptz_ops'),
				table.readAt.asc().nullsLast().op('uuid_ops')
			)
			.where(sql`(read_at IS NULL)`),
		foreignKey({
			columns: [table.memberId],
			foreignColumns: [orgMembers.id],
			name: 'notifications_member_id_fkey'
		}),
		foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: 'notifications_org_id_fkey'
		}),
		pgPolicy('notifications: members select own notifications only', {
			as: 'permissive',
			for: 'select',
			to: ['authenticated'],
			using: sql`(member_id = get_my_member_id())`
		})
	]
);
