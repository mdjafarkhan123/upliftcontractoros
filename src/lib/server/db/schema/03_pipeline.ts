import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	integer,
	numeric,
	timestamp,
	date,
	index
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';

// A deal's lifecycle state. `open` deals show on the board; `won`/`lost` are
// terminal and leave the board (Pipedrive/GHL model — status, not a stage).
export const pipelineStatusEnum = pgEnum('pipeline_status', ['open', 'won', 'lost']);

// Structured pick list for why a deal was lost — enables win/loss reporting.
// Free-text context goes in lost_reason_note.
export const pipelineLostReasonEnum = pgEnum('pipeline_lost_reason', [
	'price',
	'competitor',
	'timing',
	'no_response',
	'scope',
	'other'
]);

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
	description: text('description'),
	stale_after_days: integer('stale_after_days'),
	probability: integer('probability'),
	// When set, entering this stage auto-sets next_follow_up_at = now + N days (if
	// the deal has no follow-up scheduled yet). Manual follow-ups always win.
	default_follow_up_days: integer('default_follow_up_days'),
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
	status: pipelineStatusEnum('status').notNull().default('open'),
	assigned_to: uuid('assigned_to').references(() => orgMembers.id),
	lost_reason: pipelineLostReasonEnum('lost_reason'),
	lost_reason_note: text('lost_reason_note'),
	closed_at: timestamp('closed_at', { withTimezone: true }),
	stage_entered_at: timestamp('stage_entered_at', { withTimezone: true }).notNull().defaultNow(),
	expected_close_date: date('expected_close_date'),
	// Per-deal follow-up reminder. When set and the time arrives, the
	// opportunity-follow-up-due sweep emits opportunity.follow_up_due (cleared in
	// the same tx, fires once). Distinct from expected_close_date (a forecast, not
	// a task). Pipeline Gap #2 Phase A.
	next_follow_up_at: timestamp('next_follow_up_at', { withTimezone: true }),
	// Set by the stale-digest cron each time this deal appears in a digest batch.
	// Cleared when a follow-up is scheduled so the deal re-enters the cycle after
	// the follow-up fires. Phase B dedupe guard.
	stale_nudged_at: timestamp('stale_nudged_at', { withTimezone: true }),
	// Set by the terminal auto-archive sweep: Won deals 7 days after closing, Lost
	// deals 30 days after. The board already hides non-open deals; this just feeds
	// a future closed-history view so settled deals fall out of working queries.
	archived_at: timestamp('archived_at', { withTimezone: true }),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type Opportunity = InferSelectModel<typeof opportunities>;
export type NewOpportunity = InferInsertModel<typeof opportunities>;

// Outcome of a manual follow-up action logged by a team member.
export const followUpOutcomeEnum = pgEnum('follow_up_outcome', [
	'called',
	'texted',
	'emailed',
	'visited',
	'no_answer'
]);

export const opportunityFollowUps = pgTable(
	'opportunity_follow_ups',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		opportunity_id: uuid('opportunity_id')
			.notNull()
			.references(() => opportunities.id),
		logged_by: uuid('logged_by')
			.notNull()
			.references(() => orgMembers.id),
		outcome: followUpOutcomeEnum('outcome').notNull(),
		note: text('note'),
		occurred_at: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
		// No deleted_at — append-only log, like activity_events.
	},
	(t) => [
		index('idx_opp_follow_ups_opportunity_id').on(t.opportunity_id),
		index('idx_opp_follow_ups_org_id').on(t.org_id)
	]
);

export type OpportunityFollowUp = InferSelectModel<typeof opportunityFollowUps>;
export type NewOpportunityFollowUp = InferInsertModel<typeof opportunityFollowUps>;
