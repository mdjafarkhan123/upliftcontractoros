import { pgTable, uuid, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';

export const quickReplies = pgTable('quick_replies', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id, { onDelete: 'cascade' }),
	created_by: uuid('created_by').references(() => orgMembers.id, { onDelete: 'set null' }),
	title: text('title').notNull(),
	body: text('body').notNull(),
	channel: text('channel').notNull().default('any'),
	sort_order: integer('sort_order').notNull().default(0),
	is_archived: boolean('is_archived').notNull().default(false),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type QuickReply = InferSelectModel<typeof quickReplies>;
export type NewQuickReply = InferInsertModel<typeof quickReplies>;
