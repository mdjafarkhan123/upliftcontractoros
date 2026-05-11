import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	integer,
	serial,
	jsonb,
	timestamp
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';

export const growthFeedTypeEnum = pgEnum('growth_feed_type', [
	'gbp_post',
	'seo',
	'social',
	'website',
	'blog',
	'review_response',
	'monthly_summary'
]);

export const automationJobStatusEnum = pgEnum('automation_job_status', [
	'pending',
	'processing',
	'completed',
	'failed',
	'cancelled'
]);

export const automationJobTypeEnum = pgEnum('automation_job_type', [
	'missed_call_textback',
	'speed_to_lead',
	'quote_followup',
	'invoice_reminder',
	'review_request',
	'appointment_reminder'
]);

export const outboxEventStatusEnum = pgEnum('outbox_event_status', [
	'pending',
	'processing',
	'processed',
	'failed',
	'dead_lettered'
]);

export const growthFeedItems = pgTable('growth_feed_items', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	type: growthFeedTypeEnum('type').notNull(),
	title: text('title').notNull(),
	body: text('body').notNull(),
	media_url: text('media_url'),
	is_monthly_summary: boolean('is_monthly_summary').notNull().default(false),
	published_at: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type GrowthFeedItem = InferSelectModel<typeof growthFeedItems>;
export type NewGrowthFeedItem = InferInsertModel<typeof growthFeedItems>;

// Agency-internal append-only log — no updated_at, no deleted_at
export const internalActivityLog = pgTable('internal_activity_log', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	author_id: text('author_id').notNull(),
	activity_type: text('activity_type').notNull(),
	title: text('title').notNull(),
	body: text('body'),
	metadata: jsonb('metadata'),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export type InternalActivityLog = InferSelectModel<typeof internalActivityLog>;
export type NewInternalActivityLog = InferInsertModel<typeof internalActivityLog>;

// In-app notification records — append-only, purged by cron at 90 days
export const notifications = pgTable('notifications', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	member_id: uuid('member_id')
		.notNull()
		.references(() => orgMembers.id),
	type: text('type').notNull(),
	title: text('title').notNull(),
	body: text('body'),
	resource_type: text('resource_type'),
	resource_id: uuid('resource_id'),
	read_at: timestamp('read_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export type Notification = InferSelectModel<typeof notifications>;
export type NewNotification = InferInsertModel<typeof notifications>;

export const automationJobs = pgTable('automation_jobs', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	type: automationJobTypeEnum('type').notNull(),
	resource_type: text('resource_type').notNull(),
	resource_id: uuid('resource_id').notNull(),
	bull_job_id: text('bull_job_id').notNull(),
	status: automationJobStatusEnum('status').notNull().default('pending'),
	attempts: integer('attempts').notNull().default(0),
	last_error: text('last_error'),
	scheduled_for: timestamp('scheduled_for', { withTimezone: true }),
	started_at: timestamp('started_at', { withTimezone: true }),
	completed_at: timestamp('completed_at', { withTimezone: true }),
	failed_at: timestamp('failed_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type AutomationJob = InferSelectModel<typeof automationJobs>;
export type NewAutomationJob = InferInsertModel<typeof automationJobs>;

export const outboxEvents = pgTable('outbox_events', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id').references(() => organizations.id),
	event_type: text('event_type').notNull(),
	event_version: integer('event_version').notNull().default(1),
	resource_type: text('resource_type').notNull(),
	resource_id: uuid('resource_id').notNull(),
	payload: jsonb('payload').notNull(),
	status: outboxEventStatusEnum('status').notNull().default('pending'),
	attempts: integer('attempts').notNull().default(0),
	max_attempts: integer('max_attempts').notNull().default(3),
	sequence: serial('sequence'),
	available_at: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
	processed_at: timestamp('processed_at', { withTimezone: true }),
	dead_lettered_at: timestamp('dead_lettered_at', { withTimezone: true }),
	last_error: text('last_error'),
	idempotency_key: text('idempotency_key').notNull().unique(),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type OutboxEvent = InferSelectModel<typeof outboxEvents>;
export type NewOutboxEvent = InferInsertModel<typeof outboxEvents>;

export const orgCounters = pgTable('org_counters', {
	org_id: uuid('org_id')
		.primaryKey()
		.references(() => organizations.id),
	next_quote_number: integer('next_quote_number').notNull().default(1),
	next_invoice_number: integer('next_invoice_number').notNull().default(1),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type OrgCounter = InferSelectModel<typeof orgCounters>;
export type NewOrgCounter = InferInsertModel<typeof orgCounters>;
