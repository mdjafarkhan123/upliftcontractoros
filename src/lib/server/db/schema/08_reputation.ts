import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	integer,
	numeric,
	timestamp,
	jsonb
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';
import { jobs } from './04_jobs';

// Strict 6-state lifecycle enum. Migration 0031 drops & recreates the type
// (no legacy values; no backward compatibility).
export const reviewRequestStatusEnum = pgEnum('review_request_status', [
	'scheduled',
	'sent',
	'engaged',
	'likely_reviewed',
	'completed_internal',
	'expired'
]);

export type ReviewRequestStatus =
	| 'scheduled'
	| 'sent'
	| 'engaged'
	| 'likely_reviewed'
	| 'completed_internal'
	| 'expired';

export const reviewEventTypeEnum = pgEnum('review_event_type', [
	'sent',
	'link_opened',
	'rating_submitted',
	'redirected_to_google',
	'reminder_sent',
	'nudge_sent',
	'expired',
	'attributed'
]);

export type ReviewEventType =
	| 'sent'
	| 'link_opened'
	| 'rating_submitted'
	| 'redirected_to_google'
	| 'reminder_sent'
	| 'nudge_sent'
	| 'expired'
	| 'attributed';

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
	status: reviewRequestStatusEnum('status').notNull().default('scheduled'),
	sent_by_automation: boolean('sent_by_automation').notNull().default(false),
	sent_by_member_id: uuid('sent_by_member_id').references(() => orgMembers.id),

	// Customer's chosen star rating on the landing page (1–5). Null until submitted.
	submitted_rating: integer('submitted_rating'),

	// Lifecycle timestamps
	sent_at: timestamp('sent_at', { withTimezone: true }),
	engaged_at: timestamp('engaged_at', { withTimezone: true }),
	redirected_to_google_at: timestamp('redirected_to_google_at', { withTimezone: true }),
	completed_at: timestamp('completed_at', { withTimezone: true }),
	expired_at: timestamp('expired_at', { withTimezone: true }),

	// Engaged-stream nudge counter (0 → 1 → 2; capped at 2)
	nudge_count: integer('nudge_count').notNull().default(0),

	// Attribution engine outputs (set only on transition to 'likely_reviewed')
	confidence_score: numeric('confidence_score', { precision: 3, scale: 2 }),
	attributed_at: timestamp('attributed_at', { withTimezone: true }),

	// Legacy fields retained on the record
	responded_at: timestamp('responded_at', { withTimezone: true }),
	token: text('token').unique(),
	token_expires_at: timestamp('token_expires_at', { withTimezone: true }),
	submission_count: integer('submission_count').notNull().default(0),

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

// Append-only event log for the review funnel. Drives funnel analytics
// (sent → opened → engaged → converted) and audit trails.
export const reviewEvents = pgTable('review_events', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	review_request_id: uuid('review_request_id')
		.notNull()
		.references(() => reviewRequests.id),
	type: reviewEventTypeEnum('type').notNull(),
	rating: integer('rating'),
	nudge_number: integer('nudge_number'),
	confidence_score: numeric('confidence_score', { precision: 3, scale: 2 }),
	meta: jsonb('meta').notNull().default({}),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export type ReviewEvent = InferSelectModel<typeof reviewEvents>;
export type NewReviewEvent = InferInsertModel<typeof reviewEvents>;
