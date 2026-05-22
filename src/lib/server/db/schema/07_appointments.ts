import { pgTable, pgEnum, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';
import { jobs } from './04_jobs';

export const appointmentTypeEnum = pgEnum('appointment_type', [
	'estimate',
	'job_start',
	'follow_up',
	'inspection',
	'other'
]);

export const appointmentStatusEnum = pgEnum('appointment_status', [
	'scheduled',
	'completed',
	'cancelled',
	'no_show'
]);

export const bookingSourceEnum = pgEnum('booking_source', ['internal', 'booking_link']);

export const appointments = pgTable('appointments', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	contact_id: uuid('contact_id')
		.notNull()
		.references(() => contacts.id),
	job_id: uuid('job_id').references(() => jobs.id),
	assigned_to: uuid('assigned_to').references(() => orgMembers.id),
	type: appointmentTypeEnum('type').notNull(),
	status: appointmentStatusEnum('status').notNull().default('scheduled'),
	title: text('title').notNull(),
	scheduled_start: timestamp('scheduled_start', { withTimezone: true }).notNull(),
	scheduled_end: timestamp('scheduled_end', { withTimezone: true }),
	location: text('location'),
	notes: text('notes'),
	reminder_24h_sent: boolean('reminder_24h_sent').notNull().default(false),
	reminder_1h_sent: boolean('reminder_1h_sent').notNull().default(false),
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
});

export type Appointment = InferSelectModel<typeof appointments>;
export type NewAppointment = InferInsertModel<typeof appointments>;
