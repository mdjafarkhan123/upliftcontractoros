import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	integer,
	timestamp,
	index,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations } from './01_org_identity';
import { contacts } from './02_contacts';

// ─────────────────────────────────────────────────────────────────────────────
// Automation Engine (Stage 3.b) — card/template multi-step sequences.
//
// Replaces the per-automation hardcoded handlers with a generic state machine:
//   automation_sequences       → one card config per org (the "recipe")
//   automation_sequence_steps  → ordered steps (the recipe's steps)
//   automation_enrollments     → live state machine per contact/resource
//
// A single self-rescheduling BullMQ job (`automation.advance`) drives each
// enrollment forward one step at a time, re-reading live state at fire-time so
// it honours opt-outs, quiet hours, channel fallback, and stop/pause conditions
// that occurred while it was waiting. See automationWorker.ts + engine.ts.
// ─────────────────────────────────────────────────────────────────────────────

// Channel selection — contact-data check at send time (GHL-style), NOT a
// delivery-failure fallback. `sms_first` = "has a usable phone? send SMS;
// otherwise send email". `both` sends on every consented channel.
export const automationStepChannelEnum = pgEnum('automation_step_channel', [
	'sms_first',
	'email_first',
	'both',
	'sms_only',
	'email_only'
]);

export const automationEnrollmentStatusEnum = pgEnum('automation_enrollment_status', [
	'active',
	'paused',
	'stopped',
	'completed'
]);

// One row per (org, card). `key` identifies the card — Stage 3.b ships
// 'speed_to_lead'; 3.c migrates the rest. Channel is the sequence default; a
// step may override it.
export const automationSequences = pgTable(
	'automation_sequences',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		key: text('key').notNull(),
		enabled: boolean('enabled').notNull().default(true),
		channel: automationStepChannelEnum('channel').notNull().default('sms_first'),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('automation_sequences_org_key_uq').on(t.org_id, t.key)]
);

export type AutomationSequence = InferSelectModel<typeof automationSequences>;
export type NewAutomationSequence = InferInsertModel<typeof automationSequences>;

// Ordered steps within a sequence. position 0 = the instant reply (delay 0);
// later positions are follow-ups. delay_minutes is measured from when the
// PREVIOUS step completed (PLAN.md Part 1). channel null = inherit the
// sequence default. Bodies are templates ({contact_name}, {org_name}, …).
export const automationSequenceSteps = pgTable(
	'automation_sequence_steps',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		sequence_id: uuid('sequence_id')
			.notNull()
			.references(() => automationSequences.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		delay_minutes: integer('delay_minutes').notNull().default(0),
		// Anchor-relative timing (Stage 3.c.3). When set, the step fires at
		// enrollment.anchor_at + offset_minutes (offset may be NEGATIVE = before the
		// anchor, e.g. -1440 = 24h before an appointment) instead of chaining
		// delay_minutes from the previous step. Null on every contact/quote/invoice
		// card → their forward-chained delay_minutes behaviour is unchanged. A step
		// whose anchored time is already in the past at schedule time is skipped, not
		// fired late (short-notice bookings).
		offset_minutes: integer('offset_minutes'),
		channel: automationStepChannelEnum('channel'),
		// Recipient of the step (Stage 3.c.3b). 'contact' (default) sends the customer
		// SMS/email on the resolved channel. 'staff' delivers an in-app notification to
		// the org's office (admins/managers) + the resource's assigned crew instead —
		// used by the post-appointment "no quote sent" nudge. Only appointment-anchored
		// staff steps are supported today.
		audience: text('audience').notNull().default('contact'),
		// Optional fire-time gate (Stage 3.c.3b). When set, the step only sends if the
		// condition holds. 'no_quote_since_anchor' = fire only if NO quote exists for the
		// contact created at/after the enrollment anchor (the appointment). Null = always
		// fire. Evaluated live at advance time so a quote created in the meantime silences
		// the nudge.
		condition: text('condition'),
		sms_body: text('sms_body'),
		email_subject: text('email_subject'),
		email_body: text('email_body'),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('automation_sequence_steps_seq_position_uq').on(t.sequence_id, t.position)]
);

export type AutomationSequenceStep = InferSelectModel<typeof automationSequenceSteps>;
export type NewAutomationSequenceStep = InferInsertModel<typeof automationSequenceSteps>;

// Live state machine: one row per contact/resource moving through a sequence.
// current_step = the index of the NEXT step to send (0 = instant reply pending).
// next_step_at + bull_job_id track the currently-scheduled advance job so it can
// be removed on stop. paused_until drives the lead-reply auto-resume (+2h).
export const automationEnrollments = pgTable(
	'automation_enrollments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		sequence_id: uuid('sequence_id')
			.notNull()
			.references(() => automationSequences.id, { onDelete: 'cascade' }),
		contact_id: uuid('contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'cascade' }),
		// Anchor that triggered the enrollment ('contact' for speed_to_lead/missed_call,
		// 'quote'/'invoice'/'appointment' for resource-anchored cards).
		resource_type: text('resource_type').notNull(),
		resource_id: uuid('resource_id').notNull(),
		status: automationEnrollmentStatusEnum('status').notNull().default('active'),
		current_step: integer('current_step').notNull().default(0),
		// Base time for the FIRST step's delay (Stage 3.c.2). null = anchor at
		// enrollment time (the default for contact-anchored cards). Date-anchored
		// cards (invoice dunning) set this to the invoice due_date so step 0 fires at
		// due_date + step0.delay_minutes; later steps still chain forward from there.
		anchor_at: timestamp('anchor_at', { withTimezone: true }),
		next_step_at: timestamp('next_step_at', { withTimezone: true }),
		bull_job_id: text('bull_job_id'),
		pause_reason: text('pause_reason'),
		paused_until: timestamp('paused_until', { withTimezone: true }),
		stop_reason: text('stop_reason'),
		last_step_sent_at: timestamp('last_step_sent_at', { withTimezone: true }),
		started_at: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
		completed_at: timestamp('completed_at', { withTimezone: true }),
		stopped_at: timestamp('stopped_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		// At most one non-terminal enrollment per (sequence, contact, resource) — the
		// double-enroll guard. A redelivered trigger hits this and no-ops. Including
		// resource_id (Stage 3.c.2) lets one contact run several concurrent
		// quote/invoice sequences; contact-anchored cards pass resource_id =
		// contact_id, so their one-per-contact behaviour is unchanged.
		uniqueIndex('automation_enrollments_active_uq')
			.on(t.sequence_id, t.contact_id, t.resource_id)
			.where(sql`${t.status} IN ('active', 'paused')`),
		// Stop/pause hooks look up live enrollments by contact.
		index('automation_enrollments_org_contact_status_idx').on(t.org_id, t.contact_id, t.status)
	]
);

export type AutomationEnrollment = InferSelectModel<typeof automationEnrollments>;
export type NewAutomationEnrollment = InferInsertModel<typeof automationEnrollments>;
