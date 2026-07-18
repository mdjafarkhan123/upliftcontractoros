import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	integer,
	smallint,
	time,
	date,
	timestamp,
	jsonb,
	index,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations } from './01_org_identity';
import { appointmentTypeEnum } from './07_appointments';

// A public form is EITHER a booking form or a request form (Jobber unifies both
// under one "Requests and bookings" forms system — ref/req/1.jpg):
//   'booking' — instant confirmed appointment. The client picks a slot and it's
//               booked (current behavior; every pre-R4 link is this).
//   'request' — the client describes the work (service details, "how did you
//               hear about us"), picks a PREFERRED time, and it arrives as a
//               Request (domain 19) to approve first. The chosen slot becomes the
//               request's assessment appointment.
export const bookingFormTypeEnum = pgEnum('booking_form_type', ['booking', 'request']);

export const bookingLinks = pgTable('booking_links', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	slug: text('slug').notNull(),
	title: text('title').notNull().default('Book an Appointment'),
	description: text('description'),
	// Which kind of public form this is. Default 'booking' keeps every existing
	// link behaving exactly as before.
	form_type: bookingFormTypeEnum('form_type').notNull().default('booking'),
	// Approval gate (Jobber `requiresBookingApproval`). Only meaningful for
	// form_type='request': ON ⇒ submissions arrive as 'pending' (Needs approval)
	// and staff must Accept before the assessment slot is confirmed; OFF ⇒ the
	// request lands as 'not_required' (auto-approved). Ignored by booking forms.
	requires_approval: boolean('requires_approval').notNull().default(true),
	appointment_type: appointmentTypeEnum('appointment_type').notNull().default('estimate'),
	slot_duration_minutes: integer('slot_duration_minutes').notNull().default(60),
	buffer_minutes: integer('buffer_minutes').notNull().default(0),
	min_advance_hours: integer('min_advance_hours').notNull().default(4),
	max_future_days: integer('max_future_days').notNull().default(60),
	display_order: integer('display_order').notNull().default(0),
	// The org's default form FOR ITS form_type (Jobber "Booking default" /
	// "Request default" toggles — ref/req/1.jpg). At most one default booking
	// form and one default request form per org (enforced by the partial unique
	// index below). It marks which form the org's generic "Book"/"Request work"
	// buttons should point at; nothing consumes it yet (no such button exists),
	// so today it is purely the stored marker.
	is_default: boolean('is_default').notNull().default(false),
	is_active: boolean('is_active').notNull().default(true),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [
	// One default per (org, form_type) among LIVE links. Partial so multiple
	// non-default (and soft-deleted) links coexist freely.
	uniqueIndex('uq_booking_links_default_per_type')
		.on(t.org_id, t.form_type)
		.where(sql`${t.is_default} AND ${t.deleted_at} IS NULL`)
]);

export type BookingLink = InferSelectModel<typeof bookingLinks>;
export type NewBookingLink = InferInsertModel<typeof bookingLinks>;

export const availabilityWindows = pgTable('availability_windows', {
	id: uuid('id').primaryKey().defaultRandom(),
	booking_link_id: uuid('booking_link_id')
		.notNull()
		.references(() => bookingLinks.id, { onDelete: 'cascade' }),
	day_of_week: smallint('day_of_week').notNull(),
	start_time: time('start_time').notNull(),
	end_time: time('end_time').notNull(),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type AvailabilityWindow = InferSelectModel<typeof availabilityWindows>;
export type NewAvailabilityWindow = InferInsertModel<typeof availabilityWindows>;

export const availabilityOverrides = pgTable('availability_overrides', {
	id: uuid('id').primaryKey().defaultRandom(),
	booking_link_id: uuid('booking_link_id')
		.notNull()
		.references(() => bookingLinks.id, { onDelete: 'cascade' }),
	override_date: date('override_date').notNull(),
	is_blocked: boolean('is_blocked').notNull().default(false),
	start_time: time('start_time'),
	end_time: time('end_time'),
	reason: text('reason'),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type AvailabilityOverride = InferSelectModel<typeof availabilityOverrides>;
export type NewAvailabilityOverride = InferInsertModel<typeof availabilityOverrides>;

// ── Form builder (R5.2 — the Jobber "Edit" tab) ────────────────────────────
//
// A public form is, underneath, ONE ordered list of "form items". Each item is
// either a STANDARDIZED field (name/company/email/phone/address/photos/lead
// source/service details — Jobber's "Standardized questions") or a CUSTOM
// question the contractor adds (short/long answer, dropdown, checkbox, etc. —
// Jobber's "Custom questions"). This table is that list, one row per item.
//
// R5.2a builds the STANDARDIZED half end-to-end (show/hide + required). The
// custom-question columns (question_type/label/options/placeholder/page) exist
// now so R5.2b (custom questions) and R5.2c (drag-reorder + sections/pages)
// EXTEND this table instead of replacing it — no throwaway migration.

// Which item flavor. Derivable from standard_key null-ness, but explicit so
// queries/filters read clearly and a custom row can never masquerade as standard.
export const bookingFormFieldKindEnum = pgEnum('booking_form_field_kind', ['standard', 'custom']);

// The fixed set of standardized fields a request form can contain. `first_name`,
// `last_name`, `phone`, and `service_details` are LOCKED (always shown/required —
// the form is useless without them, matching Jobber which never lets you remove
// them). The rest are contractor-configurable (show/hide + required).
export const bookingFormFieldKeyEnum = pgEnum('booking_form_field_key', [
	'first_name',
	'last_name',
	'company_name',
	'email',
	'phone',
	'address',
	'service_details',
	'photos',
	'lead_source'
]);

export const bookingFormFields = pgTable(
	'booking_form_fields',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		booking_link_id: uuid('booking_link_id')
			.notNull()
			.references(() => bookingLinks.id, { onDelete: 'cascade' }),
		kind: bookingFormFieldKindEnum('kind').notNull().default('standard'),
		// Set for kind='standard'; NULL for custom questions.
		standard_key: bookingFormFieldKeyEnum('standard_key'),
		// Custom-question columns (R5.2b). NULL / unused for standardized rows.
		// `question_type` is plain text (not an enum) because the custom-question
		// type set grows in R5.2b — text + Zod validation avoids an enum-ALTER each
		// time a new type is added.
		question_type: text('question_type'),
		// Custom label (custom questions) or an optional override of a standardized
		// field's built-in label. NULL ⇒ use the built-in label.
		label: text('label'),
		help_text: text('help_text'),
		placeholder: text('placeholder'),
		// Choices for select/radio/checkbox custom questions (R5.2b): string[].
		options: jsonb('options'),
		// Show/hide (Jobber add/remove a standardized question). Locked rows stay true.
		is_enabled: boolean('is_enabled').notNull().default(true),
		is_required: boolean('is_required').notNull().default(false),
		// LOCKED = the contractor can't hide or un-require it (name/phone/details).
		// The builder UI shows these as "Always shown" with no toggle.
		is_locked: boolean('is_locked').notNull().default(false),
		// Order within the form (consumed by the drag-reorder + flat renderer in
		// R5.2c; R5.2a just seeds it in the natural order).
		position: integer('position').notNull().default(0),
		// Which page/section the item lives on (R5.2c "Add section"). 0 = first page.
		page: integer('page').notNull().default(0),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('idx_booking_form_fields_link').on(t.booking_link_id, t.position),
		// A standardized field can appear at most once per form (no duplicate
		// "Address" rows). Partial: custom rows (standard_key NULL) are unconstrained.
		uniqueIndex('uq_booking_form_fields_standard_key')
			.on(t.booking_link_id, t.standard_key)
			.where(sql`${t.standard_key} IS NOT NULL`)
	]
);

export type BookingFormField = InferSelectModel<typeof bookingFormFields>;
export type NewBookingFormField = InferInsertModel<typeof bookingFormFields>;
