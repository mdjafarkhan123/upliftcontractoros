import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	integer,
	numeric,
	timestamp,
	jsonb,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';

export const conversationStatusEnum = pgEnum('conversation_status', ['open', 'closed', 'snoozed']);

export const messageChannelEnum = pgEnum('message_channel', [
	'sms',
	'missed_call',
	'email',
	'webchat',
	'messenger'
]);

export const messageDirectionEnum = pgEnum('message_direction', ['inbound', 'outbound']);

export const messageStatusEnum = pgEnum('message_status', [
	'sent',
	'delivered',
	'failed',
	'received',
	'queued',
	'bounced',
	'sending',
	'undeliverable'
]);

export const conversations = pgTable('conversations', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	contact_id: uuid('contact_id')
		.notNull()
		.references(() => contacts.id),
	status: conversationStatusEnum('status').notNull().default('open'),
	subject: text('subject'),
	reply_alias: text('reply_alias'),
	assigned_to: uuid('assigned_to').references(() => orgMembers.id),
	last_message_at: timestamp('last_message_at', { withTimezone: true }),
	last_message_preview: text('last_message_preview'),
	last_message_channel: messageChannelEnum('last_message_channel'),
	last_message_direction: messageDirectionEnum('last_message_direction'),
	last_inbound_at: timestamp('last_inbound_at', { withTimezone: true }),
	last_outbound_at: timestamp('last_outbound_at', { withTimezone: true }),
	last_inbound_email_at: timestamp('last_inbound_email_at', { withTimezone: true }),
	last_outbound_email_at: timestamp('last_outbound_email_at', { withTimezone: true }),
	first_response_at: timestamp('first_response_at', { withTimezone: true }),
	unread_count: integer('unread_count').notNull().default(0),
	tags: text('tags')
		.array()
		.notNull()
		.default(sql`'{}'`),
	snoozed_until: timestamp('snoozed_until', { withTimezone: true }),
	snoozed_by: uuid('snoozed_by').references(() => orgMembers.id),
	closed_at: timestamp('closed_at', { withTimezone: true }),
	closed_by: uuid('closed_by').references(() => orgMembers.id),
	closed_reason: text('closed_reason'),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type Conversation = InferSelectModel<typeof conversations>;
export type NewConversation = InferInsertModel<typeof conversations>;

export const messages = pgTable('messages', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	conversation_id: uuid('conversation_id')
		.notNull()
		.references(() => conversations.id),
	direction: messageDirectionEnum('direction').notNull(),
	channel: messageChannelEnum('channel').notNull(),
	body: text('body'),
	is_internal_note: boolean('is_internal_note').notNull().default(false),
	media_urls: text('media_urls').array(),
	status: messageStatusEnum('status').notNull(),
	twilio_message_sid: text('twilio_message_sid'),
	// Messenger message id (Meta `mid`). Set on inbound messenger messages for
	// webhook-retry dedup; null for all other channels and outbound rows.
	messenger_mid: text('messenger_mid'),

	reply_to_message_id: uuid('reply_to_message_id'),
	failure_reason: text('failure_reason'),
	failed_at: timestamp('failed_at', { withTimezone: true }),
	source: text('source'),

	email_provider: text('email_provider'),
	email_provider_message_id: text('email_provider_message_id'),
	email_subject: text('email_subject'),
	email_from_address: text('email_from_address'),
	email_to_addresses: text('email_to_addresses').array(),
	email_cc_addresses: text('email_cc_addresses').array(),
	email_in_reply_to: text('email_in_reply_to'),
	email_references: text('email_references'),
	email_message_id: text('email_message_id'),
	search_vector: text('search_vector').generatedAlwaysAs(
		sql`to_tsvector('english', coalesce(body, ''))`
	),
	opened_at: timestamp('opened_at', { withTimezone: true }),
	delivered_at: timestamp('delivered_at', { withTimezone: true }),
	bounced_at: timestamp('bounced_at', { withTimezone: true }),
	bounce_type: text('bounce_type'),
	send_attempts: integer('send_attempts').notNull().default(0),

	// Dollar cost charged against the org SMS credit balance at send time.
	// Stamped on Twilio success; null for non-SMS channels and unsent rows.
	sms_cost: numeric('sms_cost', { precision: 12, scale: 4 }),

	sent_by: uuid('sent_by').references(() => orgMembers.id),
	sent_at: timestamp('sent_at', { withTimezone: true }),
	read_at: timestamp('read_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [
	// Inbound Messenger dedup — Meta redelivers webhooks; the `mid` is the unique key.
	uniqueIndex('idx_messages_messenger_mid')
		.on(t.messenger_mid)
		.where(sql`${t.messenger_mid} IS NOT NULL`)
]);

export type Message = InferSelectModel<typeof messages>;
export type NewMessage = InferInsertModel<typeof messages>;

export const inboundCommunicationEvents = pgTable('inbound_communication_events', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	provider: text('provider').notNull(),
	provider_event_id: text('provider_event_id'),
	event_type: text('event_type').notNull(),
	raw_payload: jsonb('raw_payload').notNull(),
	processed_at: timestamp('processed_at', { withTimezone: true }),
	error: text('error'),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export type InboundCommunicationEvent = InferSelectModel<typeof inboundCommunicationEvents>;
export type NewInboundCommunicationEvent = InferInsertModel<typeof inboundCommunicationEvents>;
