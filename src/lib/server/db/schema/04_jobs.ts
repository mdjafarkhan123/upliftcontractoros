import { pgTable, pgEnum, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';
import { opportunities } from './03_pipeline';

export const jobStatusEnum = pgEnum('job_status', [
	'scheduled',
	'in_progress',
	'completed',
	'cancelled'
]);

export const jobSourceEnum = pgEnum('job_source', ['opportunity', 'manual']);

export const jobs = pgTable('jobs', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	opportunity_id: uuid('opportunity_id').references(() => opportunities.id),
	source: jobSourceEnum('source').notNull().default('opportunity'),
	contact_id: uuid('contact_id')
		.notNull()
		.references(() => contacts.id),
	title: text('title').notNull(),
	status: jobStatusEnum('status').notNull().default('scheduled'),
	assigned_to: uuid('assigned_to').references(() => orgMembers.id),
	notes: text('notes'),
	scope_of_work: text('scope_of_work'),
	service_address_line_1: text('service_address_line_1'),
	service_address_line_2: text('service_address_line_2'),
	service_address_city: text('service_address_city'),
	service_address_state: text('service_address_state'),
	service_address_zip: text('service_address_zip'),
	scheduled_start: timestamp('scheduled_start', { withTimezone: true }),
	scheduled_end: timestamp('scheduled_end', { withTimezone: true }),
	completed_at: timestamp('completed_at', { withTimezone: true }),
	cancelled_at: timestamp('cancelled_at', { withTimezone: true }),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type Job = InferSelectModel<typeof jobs>;
export type NewJob = InferInsertModel<typeof jobs>;
