import {
	pgTable,
	pgEnum,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	primaryKey,
	index,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql, type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';
import { jobs } from './04_jobs';
import { invoices } from './06_revenue';
import { requests } from './19_requests';

export const appointmentTypeEnum = pgEnum('appointment_type', [
	'estimate',
	'job_start',
	'follow_up',
	'inspection',
	'other'
]);

export const appointmentStatusEnum = pgEnum('appointment_status', [
	// A visit with a date/time on the calendar (or an "Anytime" visit with a date but no time).
	'scheduled',
	// Jobber's unscheduled visit: a placeholder visit with NO date yet (scheduled_start NULL).
	// It never appears on the calendar or in reminders — it lives only in the job's Visits list,
	// where the contractor can complete it, edit it, or give it a date later ("Schedule later").
	'unscheduled',
	'completed',
	'cancelled',
	'no_show'
]);

export const bookingSourceEnum = pgEnum('booking_source', ['internal', 'booking_link']);

export const appointments = pgTable(
	'appointments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		contact_id: uuid('contact_id')
			.notNull()
			.references(() => contacts.id),
		job_id: uuid('job_id').references(() => jobs.id),
		// Jobber's Assessment: an on-site visit to scope work BEFORE quoting. An
		// assessment is just an appointment (type 'estimate') linked to its parent
		// request — scheduling/anytime/schedule-later/crew/reminders/completion all
		// reused as-is. Mutually exclusive with job_id (a visit belongs to a job OR
		// a request, never both). At most ONE live assessment per request — enforced
		// by partial unique index uq_appointments_live_assessment below.
		request_id: uuid('request_id').references(() => requests.id),
		assigned_to: uuid('assigned_to').references(() => orgMembers.id),
		type: appointmentTypeEnum('type').notNull(),
		status: appointmentStatusEnum('status').notNull().default('scheduled'),
		title: text('title').notNull(),
		// NULL = an unscheduled visit (Jobber "Schedule later"): a placeholder with no date yet.
		// Every dated query (calendar window, reminder worker, visit-based billing scan) compares
		// against a range or `<= now()`, so a NULL start is naturally excluded — an unscheduled
		// visit never lands on the calendar or fires a reminder. It only surfaces in the job's
		// Visits list, where it can be completed or given a date.
		scheduled_start: timestamp('scheduled_start', { withTimezone: true }),
		scheduled_end: timestamp('scheduled_end', { withTimezone: true }),
		// "Anytime" visit (Jobber/Housecall Pro pattern): a date with no specific clock time.
		// When true, `scheduled_start` anchors the DATE (stored at noon org-time so day-bucketing
		// is DST-safe) and `scheduled_end` is NULL. Calendar renders these in the top "Anytime"
		// lane instead of a time row, and the reminder worker skips them (no time to remind before).
		all_day: boolean('all_day').notNull().default(false),
		location: text('location'),
		notes: text('notes'),
		reminder_24h_sent: boolean('reminder_24h_sent').notNull().default(false),
		reminder_1h_sent: boolean('reminder_1h_sent').notNull().default(false),
		// Recurring billing (manual, visit-based): set when this visit has been rolled into a
		// generated invoice. NULL = not yet billed. This is the idempotency anchor that stops
		// POST /api/jobs/[id]/generate-invoice from billing the same visit twice. Only ever set
		// on job visits; standalone appointments leave it NULL.
		billed_invoice_id: uuid('billed_invoice_id').references(() => invoices.id),
		// Per-visit completion (S5). When a visit/appointment is marked completed, the crew can
		// leave a note about what was done on THIS visit and stamp who/when. Separate from `notes`
		// (which holds the up-front scheduling / visit instructions). Photos for the visit live in
		// `media` (parent job_id + line_key = this appointment's id, purpose_tag 'job_visit_photo').
		completion_notes: text('completion_notes'),
		completed_at: timestamp('completed_at', { withTimezone: true }),
		completed_by: uuid('completed_by').references(() => orgMembers.id),
		// Set ONLY when the completion was invoice-driven — i.e. generating an invoice for a due
		// visit auto-marked it completed (Jobber Part 1). This is the deterministic marker that lets
		// invoice DELETE revert exactly the completions that invoice caused, and never a completion a
		// crew member entered by hand (that leaves this NULL). Cleared when the visit is un-billed.
		completed_via_invoice_id: uuid('completed_via_invoice_id').references(() => invoices.id),
		cancelled_at: timestamp('cancelled_at', { withTimezone: true }),
		deleted_at: timestamp('deleted_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

		booked_via_link_id: uuid('booked_via_link_id'),
		customer_name: text('customer_name'),
		customer_phone: text('customer_phone'),
		customer_email: text('customer_email'),
		customer_notes: text('customer_notes'),
		booking_source: bookingSourceEnum('booking_source').notNull().default('internal'),
		booking_referrer: text('booking_referrer')
	},
	(t) => [
		// Per-job visit lookups (recurring visit-based billing badge on the jobs list, and the
		// generate-invoice endpoint's unbilled-visit scan) filter appointments by job_id.
		index('idx_appointments_job_id').on(t.job_id),
		// One live assessment per request (Jobber: `assessment` is 0-or-1). Partial:
		// soft-deleted rows don't count, so deleting an assessment frees the slot.
		// Doubles as the request→assessment lookup index.
		uniqueIndex('uq_appointments_live_assessment')
			.on(t.request_id)
			.where(sql`request_id IS NOT NULL AND deleted_at IS NULL`)
	]
);

export type Appointment = InferSelectModel<typeof appointments>;
export type NewAppointment = InferInsertModel<typeof appointments>;

// Multi-assignee join. `appointments.assigned_to` stays as the denormalized
// lead pointer so list queries / "my appointments" stay fast; this table is
// the source of truth for the full crew.
//
// Invariant: at most one row per appointment may have is_lead = true. Enforced
// by partial unique index `idx_appt_assignees_one_lead`.
export const appointmentAssignees = pgTable(
	'appointment_assignees',
	{
		appointment_id: uuid('appointment_id')
			.notNull()
			.references(() => appointments.id, { onDelete: 'cascade' }),
		member_id: uuid('member_id')
			.notNull()
			.references(() => orgMembers.id),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		is_lead: boolean('is_lead').notNull().default(false),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		pk: primaryKey({ columns: [t.appointment_id, t.member_id] }),
		byMember: index('idx_appt_assignees_member_org').on(t.member_id, t.org_id),
		oneLead: uniqueIndex('idx_appt_assignees_one_lead')
			.on(t.appointment_id)
			.where(sql`is_lead = true`)
	})
);

export type AppointmentAssignee = InferSelectModel<typeof appointmentAssignees>;
export type NewAppointmentAssignee = InferInsertModel<typeof appointmentAssignees>;

// ─────────────────────────────────────────────────────────────────────────────
// Calendar Events (Jobber's `Event` model): a NON-billable time block on the
// schedule — team meeting, holiday, PTO, equipment maintenance, supplier run.
// It is a SEPARATE object from an appointment/visit, deliberately (Jobber does
// not overload "visit" to mean everything on the calendar):
//   • customer is OPTIONAL — `contact_id` is nullable (an Event may attach a
//     client but doesn't require one; that's the whole reason it's its own table,
//     since `appointments.contact_id` is NOT NULL).
//   • never touches jobs, invoicing, line items, or the visit lifecycle.
//   • shares the calendar grid with visits only through a common shape
//     (start/end/all_day/assignees), mirroring Jobber's ScheduledItemInterface.
// Recurrence (RRULE) and completion state are deferred to a later phase — this
// is the "core block first" pass.
export const calendarEvents = pgTable(
	'calendar_events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		// Optional client link (Jobber Events may attach a client but don't require one).
		contact_id: uuid('contact_id').references(() => contacts.id),
		// Denormalized lead pointer (source of truth = calendar_event_assignees), so
		// restricted-view members and "my schedule" queries stay fast — mirrors
		// `appointments.assigned_to`.
		assigned_to: uuid('assigned_to').references(() => orgMembers.id),
		title: text('title').notNull(),
		description: text('description'),
		// Both null = an unscheduled event (backlog placeholder), like visits.
		// all_day = a full-day block (holiday / PTO): `start_at` anchors the DATE
		// (stored at noon org-time so day-bucketing is DST-safe) and `end_at` is NULL.
		start_at: timestamp('start_at', { withTimezone: true }),
		end_at: timestamp('end_at', { withTimezone: true }),
		all_day: boolean('all_day').notNull().default(false),
		location: text('location'),
		// Minutes before start to notify the assigned crew (Jobber teamReminderOffset).
		team_reminder_offset_minutes: integer('team_reminder_offset_minutes'),
		created_by: uuid('created_by').references(() => orgMembers.id),
		deleted_at: timestamp('deleted_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		// Calendar window scans filter by org + start_at.
		index('idx_calendar_events_org_start').on(t.org_id, t.start_at)
	]
);

export type CalendarEvent = InferSelectModel<typeof calendarEvents>;
export type NewCalendarEvent = InferInsertModel<typeof calendarEvents>;

// Multi-assignee join for events — same shape + one-lead invariant as
// appointment_assignees. `calendar_events.assigned_to` stays the denormalized
// lead pointer; this table is the source of truth for the full crew.
export const calendarEventAssignees = pgTable(
	'calendar_event_assignees',
	{
		event_id: uuid('event_id')
			.notNull()
			.references(() => calendarEvents.id, { onDelete: 'cascade' }),
		member_id: uuid('member_id')
			.notNull()
			.references(() => orgMembers.id),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		is_lead: boolean('is_lead').notNull().default(false),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		pk: primaryKey({ columns: [t.event_id, t.member_id] }),
		byMember: index('idx_event_assignees_member_org').on(t.member_id, t.org_id),
		oneLead: uniqueIndex('idx_event_assignees_one_lead')
			.on(t.event_id)
			.where(sql`is_lead = true`)
	})
);

export type CalendarEventAssignee = InferSelectModel<typeof calendarEventAssignees>;
export type NewCalendarEventAssignee = InferInsertModel<typeof calendarEventAssignees>;

// ─────────────────────────────────────────────────────────────────────────────
// Invoice Reminders (Jobber's `INVOICE_REMINDER` ScheduledItemType): a CONTRACTOR
// to-do — "on this date, remember to invoice this job." It lives in its OWN table,
// deliberately separate from `calendar_events` (the Event model) and `appointments`
// (the Visit model), matching Jobber, which does NOT overload one object to mean
// every kind of scheduled work — it unifies them only through a shared shape. An
// invoice reminder:
//   • ALWAYS belongs to a job (`job_id` NOT NULL) — unlike an Event.
//   • is a task for the CONTRACTOR, NOT customer dunning (past-due follow-ups are
//     the separate invoice-reminder org settings).
//   • when its date comes due while still 'active', the job surfaces as "requires
//     invoicing" (wired in a later phase); completing it clears that.
//   • shares the calendar-item shape (start/end/all_day/assignees) so it can later
//     render on the schedule grid alongside visits and events.
export const jobInvoiceReminderStatusEnum = pgEnum('job_invoice_reminder_status', [
	'active',
	'completed'
]);

export const jobInvoiceReminders = pgTable(
	'job_invoice_reminders',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		job_id: uuid('job_id')
			.notNull()
			.references(() => jobs.id),
		// Denormalized lead pointer (source of truth = job_invoice_reminder_assignees),
		// so "my reminders" / restricted-view queries stay fast — mirrors
		// appointments.assigned_to / calendar_events.assigned_to.
		assigned_to: uuid('assigned_to').references(() => orgMembers.id),
		description: text('description'),
		// How this reminder came to exist. 'manual' = the contractor pressed "Add Reminder"
		// (B3.1); 'auto' = the billing engine generated it from billing_frequency (B3.2). Only
		// AUTO rows are ever touched by regeneration — a frequency change never wipes a manual
		// reminder. Default 'manual' so every pre-B3.2 row stays manual. Text (not an enum) for
		// the same reason billing_type is text: a tiny closed set that avoids the DROP TYPE trap.
		source: text('source').notNull().default('manual'), // 'auto' | 'manual'
		// The visit this auto reminder tracks (per_visit billing), NULL for manual reminders and
		// for on_completion / periodic auto reminders that aren't tied to one visit. Doubles as the
		// idempotency key: at most one live auto reminder per (job, visit), so regeneration matches
		// on it and never double-creates. No cascade — visits are soft-deleted, so the FK stays valid.
		visit_id: uuid('visit_id').references(() => appointments.id),
		// NULL start = "schedule later" (Jobber): a reminder with no date yet. It never
		// looks overdue and never lands on the calendar until it is given a date.
		scheduled_start: timestamp('scheduled_start', { withTimezone: true }),
		scheduled_end: timestamp('scheduled_end', { withTimezone: true }),
		// "Anytime": a date with no clock time. `scheduled_start` anchors the DATE
		// (stored at noon org-time so day-bucketing is DST-safe) and `scheduled_end`
		// is NULL.
		all_day: boolean('all_day').notNull().default(false),
		status: jobInvoiceReminderStatusEnum('status').notNull().default('active'),
		completed_at: timestamp('completed_at', { withTimezone: true }),
		completed_by: uuid('completed_by').references(() => orgMembers.id),
		// Whether to email the assigned crew when this reminder is assigned. Stored
		// now; the actual send is wired through the outbox in a later phase (B3.2).
		notify_team_on_assign: boolean('notify_team_on_assign').notNull().default(false),
		created_by: uuid('created_by').references(() => orgMembers.id),
		deleted_at: timestamp('deleted_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		// The job's Reminders tab lists reminders by job_id (live rows only).
		index('idx_job_invoice_reminders_job').on(t.job_id),
		// A later "due reminder" scan filters by org + status + scheduled_start.
		index('idx_job_invoice_reminders_org_due').on(t.org_id, t.status, t.scheduled_start),
		// Invoicing-clear + regeneration look up a visit's auto reminder by visit_id.
		index('idx_job_invoice_reminders_visit').on(t.visit_id)
	]
);

export type JobInvoiceReminder = InferSelectModel<typeof jobInvoiceReminders>;
export type NewJobInvoiceReminder = InferInsertModel<typeof jobInvoiceReminders>;

// Multi-assignee join for invoice reminders — same shape + one-lead invariant as
// appointment_assignees / calendar_event_assignees. `job_invoice_reminders.assigned_to`
// stays the denormalized lead pointer; this table is the source of truth for the crew.
export const jobInvoiceReminderAssignees = pgTable(
	'job_invoice_reminder_assignees',
	{
		reminder_id: uuid('reminder_id')
			.notNull()
			.references(() => jobInvoiceReminders.id, { onDelete: 'cascade' }),
		member_id: uuid('member_id')
			.notNull()
			.references(() => orgMembers.id),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		is_lead: boolean('is_lead').notNull().default(false),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		pk: primaryKey({ columns: [t.reminder_id, t.member_id] }),
		byMember: index('idx_reminder_assignees_member_org').on(t.member_id, t.org_id),
		oneLead: uniqueIndex('idx_reminder_assignees_one_lead')
			.on(t.reminder_id)
			.where(sql`is_lead = true`)
	})
);

export type JobInvoiceReminderAssignee = InferSelectModel<typeof jobInvoiceReminderAssignees>;
export type NewJobInvoiceReminderAssignee = InferInsertModel<typeof jobInvoiceReminderAssignees>;
