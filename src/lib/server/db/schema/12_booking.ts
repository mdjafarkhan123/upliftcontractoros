import {
	pgTable,
	uuid,
	text,
	boolean,
	integer,
	smallint,
	time,
	date,
	timestamp
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations } from './01_org_identity';
import { appointmentTypeEnum } from './07_appointments';

export const bookingLinks = pgTable('booking_links', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	slug: text('slug').notNull(),
	title: text('title').notNull().default('Book an Appointment'),
	description: text('description'),
	appointment_type: appointmentTypeEnum('appointment_type').notNull().default('estimate'),
	slot_duration_minutes: integer('slot_duration_minutes').notNull().default(60),
	buffer_minutes: integer('buffer_minutes').notNull().default(0),
	min_advance_hours: integer('min_advance_hours').notNull().default(4),
	max_future_days: integer('max_future_days').notNull().default(60),
	display_order: integer('display_order').notNull().default(0),
	is_active: boolean('is_active').notNull().default(true),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

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
