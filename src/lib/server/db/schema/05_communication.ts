import { pgTable, pgEnum, uuid, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';

export const conversationChannelEnum = pgEnum('conversation_channel', [
	'sms',
	'missed_call',
	'email',
	'webchat'
]);

export const conversationStatusEnum = pgEnum('conversation_status', [
	'open',
	'closed',
	'archived'
]);

export const messageChannelEnum = pgEnum('message_channel', ['sms', 'email', 'webchat']);

export const messageDirectionEnum = pgEnum('message_direction', ['inbound', 'outbound']);

export const messageStatusEnum = pgEnum('message_status', [
	'sent',
	'delivered',
	'failed',
	'received',
	'queued',
	'bounced'
]);

export const conversations = pgTable('conversations', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	contact_id: uuid('contact_id')
		.notNull()
		.references(() => contacts.id),
	channel: conversationChannelEnum('channel').notNull(),
	status: conversationStatusEnum('status').notNull().default('open'),
	subject: text('subject'),
	assigned_to: uuid('assigned_to').references(() => orgMembers.id),
	last_message_at: timestamp('last_message_at', { withTimezone: true }),
	unread_count: integer('unread_count').notNull().default(0),
	tags: text('tags')
		.array()
		.notNull()
		.default(sql`'{}'`),
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
	sent_by: uuid('sent_by').references(() => orgMembers.id),
	sent_at: timestamp('sent_at', { withTimezone: true }),
	read_at: timestamp('read_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type Message = InferSelectModel<typeof messages>;
export type NewMessage = InferInsertModel<typeof messages>;
