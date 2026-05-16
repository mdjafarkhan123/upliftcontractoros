import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations } from './01_org_identity';
import { contacts } from './02_contacts';
import { conversations } from './05_communication';

export const webchatWidgets = pgTable('webchat_widgets', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.unique()
		.references(() => organizations.id),
	display_name: text('display_name'),
	intro_message: text('intro_message').default(
		"We'll text you back — no robocalls, just a real person from our team."
	),
	offline_message: text('offline_message').default(
		"We're currently on site helping customers. Leave your details and we'll reply as soon as possible."
	),
	webchat_mode: text('webchat_mode').notNull().default('asynchronous'),
	domain_allowlist: text('domain_allowlist')
		.array()
		.notNull()
		.default(sql`'{}'`),
	is_active: boolean('is_active').notNull().default(true),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type WebchatWidget = InferSelectModel<typeof webchatWidgets>;
export type NewWebchatWidget = InferInsertModel<typeof webchatWidgets>;

export const webchatSessions = pgTable('webchat_sessions', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	contact_id: uuid('contact_id')
		.notNull()
		.references(() => contacts.id),
	conversation_id: uuid('conversation_id')
		.notNull()
		.references(() => conversations.id),
	session_token: uuid('session_token').notNull().unique().default(sql`gen_random_uuid()`),
	visitor_ip_hash: text('visitor_ip_hash'),
	user_agent_hash: text('user_agent_hash'),
	last_active_at: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export type WebchatSession = InferSelectModel<typeof webchatSessions>;
export type NewWebchatSession = InferInsertModel<typeof webchatSessions>;
