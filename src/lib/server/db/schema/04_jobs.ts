import {
	pgTable,
	pgEnum,
	uuid,
	text,
	varchar,
	numeric,
	timestamp,
	date,
	jsonb,
	boolean,
	index,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql, type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';
import { opportunities } from './03_pipeline';
import type { JobRecurrence } from '../../jobs/recurrence';

export const jobStatusEnum = pgEnum('job_status', [
	'scheduled',
	'in_progress',
	'on_hold',
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
	// Free-text category for the work (e.g. Repair, Installation, Maintenance). UI offers a
	// preset combobox but any value is allowed — no separate job-type settings table yet.
	job_type: text('job_type'),
	// Operational descriptors, mirrors contacts.tags exactly (text[] default '{}').
	tags: text('tags')
		.array()
		.notNull()
		.default(sql`'{}'`),
	notes: text('notes'),
	scope_of_work: text('scope_of_work'),
	// ── Pricing / totals ────────────────────────────────────────────────────────
	// Jobs carry their own line items + money (Jobber/Autopilot model). On quote→job
	// conversion the quote's lines + discount/tax are SNAPSHOT-copied here; afterwards the
	// job and quote are fully independent. Math mirrors quotes exactly (recalcJobTotals):
	// discount applied to subtotal BEFORE tax. Line items live in job_line_items (06_revenue).
	subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
	discount_type: text('discount_type').notNull().default('none'), // 'none' | 'fixed' | 'percent'
	discount_value: numeric('discount_value', { precision: 12, scale: 2 }),
	discount_amount: numeric('discount_amount', { precision: 12, scale: 2 }),
	discount_label: varchar('discount_label', { length: 60 }),
	tax_rate: numeric('tax_rate', { precision: 5, scale: 4 }).notNull().default('0'),
	tax_amount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
	total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
	service_address_line_1: text('service_address_line_1'),
	service_address_line_2: text('service_address_line_2'),
	service_address_city: text('service_address_city'),
	service_address_state: text('service_address_state'),
	service_address_zip: text('service_address_zip'),
	// One-off billing reminder: when true, completing this job nudges the contractor (in-app
	// notification) to invoice it so it doesn't slip through. Pure operational flag — no money.
	invoice_on_close: boolean('invoice_on_close').notNull().default(false),
	// ── Recurring billing (manual) ──────────────────────────────────────────────
	// How a RECURRING job is invoiced. NULL = no recurring billing configured (every one-off
	// job, and recurring jobs whose billing hasn't been set up). 'visit_based' = each past
	// visit becomes a billable line grouped onto one invoice, priced at the job's line-item
	// total (the lines describe one visit's work). 'fixed' = each invoice is a flat set amount
	// (fixed_invoice_amount). Manual v1: the contractor generates each invoice on demand via
	// POST /api/jobs/[id]/generate-invoice — nothing auto-charges yet. This is the foundation
	// the deferred auto-invoice + auto-charge layer builds on.
	billing_type: text('billing_type'), // 'visit_based' | 'fixed' | null
	// Advisory cadence for how often to invoice the recurring work. Stored for display + as the
	// schedule the deferred billing cron will read; it does NOT fire any automatic invoice in
	// v1. 'per_visit' | 'weekly' | 'biweekly' | 'monthly'.
	invoice_frequency: text('invoice_frequency'),
	// Flat per-invoice amount when billing_type = 'fixed' (tax-inclusive, like a milestone).
	// NULL for visit-based / non-billing jobs.
	fixed_invoice_amount: numeric('fixed_invoice_amount', { precision: 12, scale: 2 }),
	scheduled_start: timestamp('scheduled_start', { withTimezone: true }),
	scheduled_end: timestamp('scheduled_end', { withTimezone: true }),
	// Recurring jobs only: the repeat rule. NULL = one-off. Visits are materialized
	// up-front as `appointments` rows (job_id link) — this column is the source rule
	// kept for display + future "edit recurring schedule". See $lib/server/jobs/recurrence.
	recurrence: jsonb('recurrence').$type<JobRecurrence>(),
	completed_at: timestamp('completed_at', { withTimezone: true }),
	cancelled_at: timestamp('cancelled_at', { withTimezone: true }),
	// ── Client sign-off (Session 6) ─────────────────────────────────────────────
	// The customer's on-site approval that the work is done (Jobber "client sign-off").
	// The drawn signature itself is a `media` row (purpose_tag job_signoff_signature,
	// bound to this job). These two columns record WHO signed and WHEN — set together
	// when the contractor captures the sign-off, cleared together on redo. NULL = not
	// yet signed. Mirrors the quote-acceptance signature columns (06_revenue).
	signoff_signature_name: varchar('signoff_signature_name', { length: 120 }),
	signoff_signed_at: timestamp('signoff_signed_at', { withTimezone: true }),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type Job = InferSelectModel<typeof jobs>;
export type NewJob = InferInsertModel<typeof jobs>;

// ── Job costing (Session 1) ─────────────────────────────────────────────────
// What the WORK COST the business, tracked against the job's revenue so the
// contractor sees real profit & margin (Jobber / Housecall Pro "Job costing").
// Line-item material cost already lives on job_line_items.unit_cost; these rows
// capture the extra out-of-pocket costs — receipts, subcontractors, equipment,
// and (until timesheets land in Session 2) labor entered by hand. Cost data is
// private: only members with can_view_revenue may read or manage it.
export const jobExpenseCategoryEnum = pgEnum('job_expense_category', [
	'materials',
	'labor',
	'subcontractor',
	'equipment',
	'other'
]);

export const jobExpenses = pgTable(
	'job_expenses',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		job_id: uuid('job_id')
			.notNull()
			.references(() => jobs.id),
		category: jobExpenseCategoryEnum('category').notNull().default('materials'),
		description: text('description').notNull(),
		// Out-of-pocket amount for this cost line. numeric(12,2), always > 0 (validated in Zod).
		amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
		// The calendar day the cost was incurred (receipt date), not the row's created_at.
		expense_date: date('expense_date').notNull(),
		notes: text('notes'),
		// Who logged the expense (display + accountability). Never nulled on member removal.
		created_by: uuid('created_by').references(() => orgMembers.id),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deleted_at: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [index('job_expenses_job_idx').on(t.job_id, t.org_id)]
);

export type JobExpense = InferSelectModel<typeof jobExpenses>;
export type NewJobExpense = InferInsertModel<typeof jobExpenses>;

// ── Time tracking (Session 2) ───────────────────────────────────────────────
// Crew clock in/out against a job (Jobber/Housecall Pro "Time tracking"). Hours roll up to the
// job and — once a rate is set on the member — feed job costing's labor_cost. A row with
// clock_out = NULL is a currently-running timer. hourly_rate_snapshot is captured at clock-out
// (or at manual-entry creation) from org_members.hourly_cost_rate, then frozen — matches the
// unit_cost snapshot pattern so a later pay-rate change never rewrites a closed job's cost.
export const jobTimeEntries = pgTable(
	'job_time_entries',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		job_id: uuid('job_id')
			.notNull()
			.references(() => jobs.id),
		// Who did the work. Preserved on member deactivation (Rule 12) — never nulled.
		org_member_id: uuid('org_member_id')
			.notNull()
			.references(() => orgMembers.id),
		clock_in: timestamp('clock_in', { withTimezone: true }).notNull(),
		// NULL = timer still running.
		clock_out: timestamp('clock_out', { withTimezone: true }),
		// Denormalized for fast rollup + display; recomputed whenever clock_in/out change.
		duration_minutes: numeric('duration_minutes', { precision: 10, scale: 2 }),
		// Frozen at clock-out (or manual-entry save). NULL when the member had no rate set at
		// that moment — the entry still counts its hours, just contributes $0 labor cost.
		hourly_rate_snapshot: numeric('hourly_rate_snapshot', { precision: 12, scale: 2 }),
		notes: text('notes'),
		// Who logged the entry — usually the worker themself, but an office admin may log time
		// on a tech's behalf. Never nulled on member removal.
		created_by: uuid('created_by').references(() => orgMembers.id),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deleted_at: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [
		index('job_time_entries_job_idx').on(t.job_id, t.org_id),
		index('job_time_entries_member_idx').on(t.org_member_id, t.org_id)
	]
);

export type JobTimeEntry = InferSelectModel<typeof jobTimeEntries>;
export type NewJobTimeEntry = InferInsertModel<typeof jobTimeEntries>;

// ── Tasks / checklist (Session 3) ───────────────────────────────────────────
// A to-do list on a job the crew ticks off in the field (Jobber "Tasks"). Each task has a
// title, an optional assigned member and optional due date, and a completed flag. When ticked
// we stamp completed_at + completed_by for accountability (mirrors the who/when snapshot on
// time entries). Ordering is held in `position`. Purely operational — no money, no outbox
// event — so anyone who can view the job sees tasks and anyone who can edit it may tick them.
export const jobTasks = pgTable(
	'job_tasks',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		job_id: uuid('job_id')
			.notNull()
			.references(() => jobs.id),
		title: text('title').notNull(),
		completed: boolean('completed').notNull().default(false),
		// Stamped when the task is first ticked; cleared if it's un-ticked.
		completed_at: timestamp('completed_at', { withTimezone: true }),
		// Who ticked it (display + accountability). Preserved on member removal — never nulled.
		completed_by: uuid('completed_by').references(() => orgMembers.id),
		// Optional crew member responsible for the task (Jobber assigns tasks to team members).
		assigned_to: uuid('assigned_to').references(() => orgMembers.id),
		// Optional calendar day the task is due (no time-of-day, like Jobber).
		due_date: date('due_date'),
		// Manual ordering within the checklist.
		position: numeric('position', { precision: 10, scale: 2 }).notNull().default('0'),
		// Who added the task. Never nulled on member removal.
		created_by: uuid('created_by').references(() => orgMembers.id),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deleted_at: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [index('job_tasks_job_idx').on(t.job_id, t.org_id)]
);

export type JobTask = InferSelectModel<typeof jobTasks>;
export type NewJobTask = InferInsertModel<typeof jobTasks>;

// ── Job forms — templates (Session 4.1) ─────────────────────────────────────
// Reusable inspection / checklist forms the contractor builds ONCE in Settings and
// later fills in the field per job (Jobber "Job Forms", Housecall Pro "Custom
// Checklists", ServiceTitan "Forms"). This session ships only the template layer:
// the reusable definition of a form and its fields. Filling a form on an actual job
// (submissions, photo/signature capture, "required before complete") is Session 4.2.
//
// Structure mirrors quote_templates + quote_template_line_items exactly: a parent
// template row owns an ordered set of field rows. Fields are normalized (not a JSON
// blob) so each field keeps a stable id — S4.2 answers will reference field_id, and
// so labels/types can change without rewriting history.
export const jobFormFieldTypeEnum = pgEnum('job_form_field_type', [
	'section', // non-input heading that groups the fields below it
	'short_text',
	'long_text',
	'number',
	'checkbox', // single yes/no
	'dropdown', // pick one of `options`
	'date',
	'photo', // capture handled in S4.2 — template just declares the slot
	'signature' // capture handled in S4.2
]);

export const jobFormTemplates = pgTable(
	'job_form_templates',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		name: text('name').notNull(),
		description: text('description'),
		// Who built the template (display + accountability). Never nulled on member removal.
		created_by: uuid('created_by').references(() => orgMembers.id),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deleted_at: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [index('job_form_templates_org_idx').on(t.org_id)]
);

export type JobFormTemplate = InferSelectModel<typeof jobFormTemplates>;
export type NewJobFormTemplate = InferInsertModel<typeof jobFormTemplates>;

export const jobFormFields = pgTable(
	'job_form_fields',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		template_id: uuid('template_id')
			.notNull()
			.references(() => jobFormTemplates.id),
		field_type: jobFormFieldTypeEnum('field_type').notNull(),
		// The question / prompt shown to the crew (e.g. "Refrigerant charged?"). For a
		// 'section' field this is the heading text.
		label: text('label').notNull(),
		// Optional hint shown under the field.
		help_text: text('help_text'),
		// Whether an answer is mandatory. Ignored for 'section' (has no answer).
		required: boolean('required').notNull().default(false),
		// Choices for a 'dropdown' field (array of strings); NULL for every other type.
		options: jsonb('options').$type<string[]>(),
		// Manual ordering within the form. Mirrors job_tasks.position.
		position: numeric('position', { precision: 10, scale: 2 }).notNull().default('0'),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deleted_at: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [index('job_form_fields_template_idx').on(t.template_id, t.org_id)]
);

export type JobFormField = InferSelectModel<typeof jobFormFields>;
export type NewJobFormField = InferInsertModel<typeof jobFormFields>;

// ── Job forms — submissions (Session 4.2) ───────────────────────────────────
// A template FILLED on an actual job (Jobber "Job Forms", Housecall Pro "Custom
// Checklists"). Attaching a template SNAPSHOT-COPIES its current field set into
// job_form_submission_fields (mirrors the quote→job line-item snapshot model): the
// filled form is then fully independent of the template, so later editing or deleting
// the template never alters a form already attached to a job. `template_id` is kept only
// for provenance; `template_name` freezes the name shown at attach time.
export const jobFormSubmissionStatusEnum = pgEnum('job_form_submission_status', [
	'in_progress', // being filled; answers editable
	'completed' // marked done (S4.2b enforces required fields before this)
]);

export const jobFormSubmissions = pgTable(
	'job_form_submissions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		job_id: uuid('job_id')
			.notNull()
			.references(() => jobs.id),
		// Provenance only — the field snapshot below is the source of truth for what's rendered.
		// Nullable so a template can be deleted without breaking attached forms.
		template_id: uuid('template_id').references(() => jobFormTemplates.id),
		// Frozen copy of the template name at attach time (templates can be renamed/deleted).
		template_name: text('template_name').notNull(),
		status: jobFormSubmissionStatusEnum('status').notNull().default('in_progress'),
		// Stamped when the form is marked completed; cleared if reopened to in_progress.
		submitted_at: timestamp('submitted_at', { withTimezone: true }),
		submitted_by: uuid('submitted_by').references(() => orgMembers.id),
		// Who attached the form. Never nulled on member removal.
		created_by: uuid('created_by').references(() => orgMembers.id),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deleted_at: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [index('job_form_submissions_job_idx').on(t.job_id, t.org_id)]
);

export type JobFormSubmission = InferSelectModel<typeof jobFormSubmissions>;
export type NewJobFormSubmission = InferInsertModel<typeof jobFormSubmissions>;

// One row = one snapshotted template field PLUS its answer on this submission. The field
// DEFINITION columns (field_type/label/help_text/required/options/position) are copied from
// job_form_fields at attach time and never change afterward. The ANSWER columns hold the
// crew's input, typed by field: value_text (short_text/long_text/dropdown selection),
// value_number (number), value_bool (checkbox), value_date (date). 'section' fields carry no
// answer. Photo/signature answers (S4.2b) are stored as `media` rows bound to the job with
// this row's id in media.line_key — no value column here.
export const jobFormSubmissionFields = pgTable(
	'job_form_submission_fields',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		submission_id: uuid('submission_id')
			.notNull()
			.references(() => jobFormSubmissions.id),
		// Provenance: which template field this was copied from. Nullable — the source field may
		// later be deleted; the snapshot here stays intact.
		source_field_id: uuid('source_field_id'),
		// ── Frozen field definition (copied from job_form_fields) ──────────────
		field_type: jobFormFieldTypeEnum('field_type').notNull(),
		label: text('label').notNull(),
		help_text: text('help_text'),
		required: boolean('required').notNull().default(false),
		options: jsonb('options').$type<string[]>(),
		position: numeric('position', { precision: 10, scale: 2 }).notNull().default('0'),
		// ── Answer (typed by field_type; all null until filled) ────────────────
		value_text: text('value_text'),
		value_number: numeric('value_number', { precision: 14, scale: 4 }),
		value_bool: boolean('value_bool'),
		value_date: date('value_date'),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('job_form_submission_fields_submission_idx').on(t.submission_id, t.org_id)]
);

export type JobFormSubmissionField = InferSelectModel<typeof jobFormSubmissionFields>;
export type NewJobFormSubmissionField = InferInsertModel<typeof jobFormSubmissionFields>;

// ── Custom fields (Session 7) ───────────────────────────────────────────────
// Org-defined extra fields that appear on EVERY job (Jobber "Custom Fields",
// Housecall Pro "Custom Fields", ServiceTitan "Custom Fields"). The contractor
// defines a field ONCE in Settings — e.g. "Gate code", "Permit #", "Warranty
// expiry", "Referred by" — and it shows on every job's detail + the New Job form
// ready to fill in.
//
// KEY DIFFERENCE from Job Forms (S4): custom fields are org-wide, LIVE metadata,
// NOT snapshot-copied per job. Renaming "Gate code" → "Access code" renames it on
// every job (definition is the source of truth). A job carries only VALUES keyed
// to the definition id. This matches how Jobber treats custom fields vs. job forms.
export const jobCustomFieldTypeEnum = pgEnum('job_custom_field_type', [
	'short_text',
	'number',
	'date',
	'dropdown', // pick one of `options`
	'checkbox', // single yes/no
	'link' // a URL (e.g. permit portal, shared drive folder)
]);

// One reusable field definition, org-wide. Ordered by `position`. Soft-deleted to
// hide it everywhere without orphaning any historical values (values reference id).
export const jobCustomFields = pgTable(
	'job_custom_fields',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		field_type: jobCustomFieldTypeEnum('field_type').notNull(),
		// The field name shown on every job (e.g. "Gate code"). Live — a rename shows everywhere.
		label: text('label').notNull(),
		// Optional hint shown under the field on the job.
		help_text: text('help_text'),
		// When true, a value is mandatory to save/create a job through the manual UI (matches
		// Jobber). Not enforced on jobs auto-created from a won opportunity — the contractor fills
		// it in on the detail page (never blocks automation).
		required: boolean('required').notNull().default(false),
		// Choices for a 'dropdown' field; NULL for every other type.
		options: jsonb('options').$type<string[]>(),
		// Manual ordering in Settings + on the job. Mirrors job_tasks.position.
		position: numeric('position', { precision: 10, scale: 2 }).notNull().default('0'),
		// Who created the field (display + accountability). Never nulled on member removal.
		created_by: uuid('created_by').references(() => orgMembers.id),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deleted_at: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [index('job_custom_fields_org_idx').on(t.org_id)]
);

export type JobCustomField = InferSelectModel<typeof jobCustomFields>;
export type NewJobCustomField = InferInsertModel<typeof jobCustomFields>;

// One value = one job's answer to one custom-field definition. Typed by the field's type:
// value_text (short_text/dropdown selection/link), value_number (number), value_bool
// (checkbox), value_date (date). Unique on (job_id, field_id) so each field has at most one
// value per job — saving upserts. No soft-delete: a value is just overwritten or cleared.
export const jobCustomFieldValues = pgTable(
	'job_custom_field_values',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		job_id: uuid('job_id')
			.notNull()
			.references(() => jobs.id),
		field_id: uuid('field_id')
			.notNull()
			.references(() => jobCustomFields.id),
		value_text: text('value_text'),
		value_number: numeric('value_number', { precision: 14, scale: 4 }),
		value_bool: boolean('value_bool'),
		value_date: date('value_date'),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('job_custom_field_values_job_idx').on(t.job_id, t.org_id),
		uniqueIndex('job_custom_field_values_job_field_uq').on(t.job_id, t.field_id)
	]
);

export type JobCustomFieldValue = InferSelectModel<typeof jobCustomFieldValues>;
export type NewJobCustomFieldValue = InferInsertModel<typeof jobCustomFieldValues>;
