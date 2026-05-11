import { pgTable, pgEnum, uuid, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';
import { jobs } from './04_jobs';

export const reviewRequestStatusEnum = pgEnum('review_request_status', [
	'pending',
	'sent',
	'responded',
	'failed',
	'no_response'
]);

export const reviewRequests = pgTable('review_requests', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	job_id: uuid('job_id')
		.notNull()
		.unique()
		.references(() => jobs.id),
	contact_id: uuid('contact_id')
		.notNull()
		.references(() => contacts.id),
	status: reviewRequestStatusEnum('status').notNull().default('pending'),
	sent_by_automation: boolean('sent_by_automation').notNull().default(false),
	sent_by_member_id: uuid('sent_by_member_id').references(() => orgMembers.id),
	response_score: integer('response_score'),
	sent_at: timestamp('sent_at', { withTimezone: true }),
	responded_at: timestamp('responded_at', { withTimezone: true }),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type ReviewRequest = InferSelectModel<typeof reviewRequests>;
export type NewReviewRequest = InferInsertModel<typeof reviewRequests>;

// Immutable positive review records — no updated_at, no deleted_at
export const reviews = pgTable('reviews', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	job_id: uuid('job_id')
		.notNull()
		.references(() => jobs.id),
	contact_id: uuid('contact_id')
		.notNull()
		.references(() => contacts.id),
	review_request_id: uuid('review_request_id').references(() => reviewRequests.id),
	score: integer('score').notNull(),
	platform: text('platform'),
	body: text('body'),
	review_url: text('review_url'),
	google_review_link_sent: boolean('google_review_link_sent').notNull().default(false),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export type Review = InferSelectModel<typeof reviews>;
export type NewReview = InferInsertModel<typeof reviews>;

export const privateFeedback = pgTable('private_feedback', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	job_id: uuid('job_id')
		.notNull()
		.references(() => jobs.id),
	contact_id: uuid('contact_id')
		.notNull()
		.references(() => contacts.id),
	review_request_id: uuid('review_request_id').references(() => reviewRequests.id),
	score: integer('score').notNull(),
	body: text('body'),
	is_resolved: boolean('is_resolved').notNull().default(false),
	resolved_by: uuid('resolved_by').references(() => orgMembers.id),
	resolved_at: timestamp('resolved_at', { withTimezone: true }),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type PrivateFeedback = InferSelectModel<typeof privateFeedback>;
export type NewPrivateFeedback = InferInsertModel<typeof privateFeedback>;
