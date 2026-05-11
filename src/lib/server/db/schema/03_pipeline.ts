import { pgTable, uuid, text, boolean, integer, numeric, timestamp } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';

export const pipelineStages = pgTable('pipeline_stages', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	name: text('name').notNull(),
	color: text('color').notNull(),
	position: integer('position').notNull(),
	is_default: boolean('is_default').notNull().default(false),
	is_won: boolean('is_won').notNull().default(false),
	is_lost: boolean('is_lost').notNull().default(false),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type PipelineStage = InferSelectModel<typeof pipelineStages>;
export type NewPipelineStage = InferInsertModel<typeof pipelineStages>;

export const opportunities = pgTable('opportunities', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	contact_id: uuid('contact_id')
		.notNull()
		.references(() => contacts.id),
	stage_id: uuid('stage_id')
		.notNull()
		.references(() => pipelineStages.id),
	title: text('title').notNull(),
	value: numeric('value', { precision: 12, scale: 2 }),
	assigned_to: uuid('assigned_to').references(() => orgMembers.id),
	lost_reason: text('lost_reason'),
	closed_at: timestamp('closed_at', { withTimezone: true }),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type Opportunity = InferSelectModel<typeof opportunities>;
export type NewOpportunity = InferInsertModel<typeof opportunities>;
