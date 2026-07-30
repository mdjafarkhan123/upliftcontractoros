import {
	pgTable,
	pgEnum,
	uuid,
	text,
	jsonb,
	timestamp,
	uniqueIndex,
	index
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';

export const communicationPreferenceChannelEnum = pgEnum('communication_preference_channel', [
	'all',
	'sms',
	'email',
	'call',
	'whatsapp',
	'messenger',
	'gbp',
	'webchat'
]);

export const communicationPreferenceDirectionEnum = pgEnum('communication_preference_direction', [
	'all',
	'inbound',
	'outbound'
]);

export const communicationPreferenceCategoryEnum = pgEnum('communication_preference_category', [
	'all',
	'manual_message',
	'marketing',
	'speed_to_lead',
	'quote_send',
	'quote_followup',
	'invoice_send',
	'invoice_reminder',
	'appointment_confirmation',
	'appointment_reminder',
	'job_scheduled',
	'job_on_my_way',
	'payment_receipt',
	'review_request',
	'private_feedback_recovery'
]);

export const communicationPreferenceStatusEnum = pgEnum('communication_preference_status', [
	'allowed',
	'blocked',
	'permanent'
]);

export const communicationPreferenceSourceEnum = pgEnum('communication_preference_source', [
	'customer',
	'user',
	'workflow',
	'provider',
	'system',
	'migration'
]);

export const communicationConsentStatusEnum = pgEnum('communication_consent_status', [
	'unknown',
	'opted_in',
	'opted_out',
	'revoked'
]);

export type CommunicationPreferenceChannel =
	(typeof communicationPreferenceChannelEnum.enumValues)[number];
export type CommunicationPreferenceDirection =
	(typeof communicationPreferenceDirectionEnum.enumValues)[number];
export type CommunicationPreferenceCategory =
	(typeof communicationPreferenceCategoryEnum.enumValues)[number];
export type CommunicationPreferenceStatus =
	(typeof communicationPreferenceStatusEnum.enumValues)[number];
export type CommunicationPreferenceSource =
	(typeof communicationPreferenceSourceEnum.enumValues)[number];
export type CommunicationConsentStatus = (typeof communicationConsentStatusEnum.enumValues)[number];

export const contactCommunicationPreferences = pgTable(
	'contact_communication_preferences',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		contact_id: uuid('contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'cascade' }),
		channel: communicationPreferenceChannelEnum('channel').notNull(),
		direction: communicationPreferenceDirectionEnum('direction').notNull(),
		category: communicationPreferenceCategoryEnum('category').notNull(),
		status: communicationPreferenceStatusEnum('status').notNull(),
		source: communicationPreferenceSourceEnum('source').notNull(),
		reason_code: text('reason_code'),
		reason_message: text('reason_message'),
		actor_member_id: uuid('actor_member_id').references(() => orgMembers.id),
		provider: text('provider'),
		provider_event_id: text('provider_event_id'),
		metadata: jsonb('metadata').notNull().default({}),
		effective_from: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
		expires_at: timestamp('expires_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('contact_comm_prefs_scope_uq').on(
			t.org_id,
			t.contact_id,
			t.channel,
			t.direction,
			t.category
		),
		index('contact_comm_prefs_contact_idx').on(t.org_id, t.contact_id),
		index('contact_comm_prefs_eval_idx').on(
			t.org_id,
			t.contact_id,
			t.channel,
			t.direction,
			t.category,
			t.status
		)
	]
);

export type ContactCommunicationPreference = InferSelectModel<
	typeof contactCommunicationPreferences
>;
export type NewContactCommunicationPreference = InferInsertModel<
	typeof contactCommunicationPreferences
>;

// Immutable audit log for GHL-style "DND enabled/disabled by user/workflow/contact/provider".
export const contactCommunicationPreferenceEvents = pgTable(
	'contact_communication_preference_events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		contact_id: uuid('contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'cascade' }),
		preference_id: uuid('preference_id').references(() => contactCommunicationPreferences.id, {
			onDelete: 'set null'
		}),
		channel: communicationPreferenceChannelEnum('channel').notNull(),
		direction: communicationPreferenceDirectionEnum('direction').notNull(),
		category: communicationPreferenceCategoryEnum('category').notNull(),
		previous_status: communicationPreferenceStatusEnum('previous_status'),
		next_status: communicationPreferenceStatusEnum('next_status').notNull(),
		source: communicationPreferenceSourceEnum('source').notNull(),
		reason_code: text('reason_code'),
		reason_message: text('reason_message'),
		actor_member_id: uuid('actor_member_id').references(() => orgMembers.id),
		provider: text('provider'),
		provider_event_id: text('provider_event_id'),
		metadata: jsonb('metadata').notNull().default({}),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('contact_comm_pref_events_contact_idx').on(t.org_id, t.contact_id, t.created_at),
		index('contact_comm_pref_events_scope_idx').on(
			t.org_id,
			t.contact_id,
			t.channel,
			t.direction,
			t.category
		)
	]
);

export type ContactCommunicationPreferenceEvent = InferSelectModel<
	typeof contactCommunicationPreferenceEvents
>;
export type NewContactCommunicationPreferenceEvent = InferInsertModel<
	typeof contactCommunicationPreferenceEvents
>;

// Legal permission is separate from DND/preference. A contact may be reachable but
// not consented for a regulated category such as SMS marketing.
export const contactCommunicationConsents = pgTable(
	'contact_communication_consents',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		contact_id: uuid('contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'cascade' }),
		channel: communicationPreferenceChannelEnum('channel').notNull(),
		category: communicationPreferenceCategoryEnum('category').notNull(),
		status: communicationConsentStatusEnum('status').notNull(),
		source: communicationPreferenceSourceEnum('source').notNull(),
		evidence: jsonb('evidence').notNull().default({}),
		consented_at: timestamp('consented_at', { withTimezone: true }),
		revoked_at: timestamp('revoked_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('contact_comm_consents_scope_uq').on(t.org_id, t.contact_id, t.channel, t.category),
		index('contact_comm_consents_contact_idx').on(t.org_id, t.contact_id)
	]
);

export type ContactCommunicationConsent = InferSelectModel<typeof contactCommunicationConsents>;
export type NewContactCommunicationConsent = InferInsertModel<typeof contactCommunicationConsents>;
