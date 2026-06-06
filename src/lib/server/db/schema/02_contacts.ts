// `status` is the lifecycle (lead | customer | archived).
// `tags` are operational descriptors (homeowner, company, vip, hot, …).
// Never put lifecycle values inside `tags` — UI vocabulary lives in
// $lib/contacts/tags.ts.
import { pgTable, pgEnum, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';

export const contactStatusEnum = pgEnum('contact_status', ['lead', 'customer', 'archived']);

export const PREFERRED_CONTACT_METHODS = ['sms', 'call', 'email', 'whatsapp', 'messenger'] as const;
export type PreferredContactMethod = (typeof PREFERRED_CONTACT_METHODS)[number];

export const addressLabelEnum = pgEnum('address_label', ['billing', 'service', 'mailing', 'other']);

export const leadSourceTypeEnum = pgEnum('lead_source_type', [
	'website_form',
	'live_chat',
	'missed_call',
	'manual',
	'referral',
	'other'
]);

export const contacts = pgTable('contacts', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	full_name: text('full_name').notNull(),
	email: text('email'),
	// Nullable since the Messenger channel: a PSID-only contact has no phone.
	// Phone remains the dedup key (UNIQUE(org_id, phone)) ONLY when present.
	// Downstream phone-assumption fixes are tracked separately and deferred.
	phone: text('phone'),
	// Secondary callable/searchable number. Populated by the merge-duplicates
	// flow when the absorbed (source) contact had a different phone than the
	// survivor, so the second number is never lost. Not subject to the
	// (org_id, phone) uniqueness constraint — only `phone` is the dedup key.
	alt_phone: text('alt_phone'),
	tags: text('tags')
		.array()
		.notNull()
		.default(sql`'{}'`),
	status: contactStatusEnum('status').notNull().default('lead'),
	assigned_to: uuid('assigned_to').references(() => orgMembers.id),
	referred_by_contact_id: uuid('referred_by_contact_id'),
	sms_opt_out: boolean('sms_opt_out').notNull().default(false),
	sms_opt_out_at: timestamp('sms_opt_out_at', { withTimezone: true }),
	sms_opt_out_source: text('sms_opt_out_source'),
	sms_opted_in_at: timestamp('sms_opted_in_at', { withTimezone: true }),
	lead_source: leadSourceTypeEnum('lead_source').notNull().default('manual'),
	notes: text('notes'),
	last_contacted_at: timestamp('last_contacted_at', { withTimezone: true }),
	next_follow_up_at: timestamp('next_follow_up_at', { withTimezone: true }),
	converted_at: timestamp('converted_at', { withTimezone: true }),
	preferred_contact_method: text('preferred_contact_method'),
	email_opt_in: boolean('email_opt_in').notNull().default(false),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type Contact = InferSelectModel<typeof contacts>;
export type NewContact = InferInsertModel<typeof contacts>;

export const contactAddresses = pgTable('contact_addresses', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	contact_id: uuid('contact_id')
		.notNull()
		.references(() => contacts.id),
	label: addressLabelEnum('label').notNull().default('service'),
	address_line_1: text('address_line_1').notNull(),
	address_line_2: text('address_line_2'),
	city: text('city').notNull(),
	state: text('state').notNull(),
	zip: text('zip').notNull(),
	is_primary: boolean('is_primary').notNull().default(false),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type ContactAddress = InferSelectModel<typeof contactAddresses>;
export type NewContactAddress = InferInsertModel<typeof contactAddresses>;

export const contactNotes = pgTable('contact_notes', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	contact_id: uuid('contact_id')
		.notNull()
		.references(() => contacts.id),
	author_id: uuid('author_id')
		.notNull()
		.references(() => orgMembers.id),
	content: text('content').notNull(),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type ContactNote = InferSelectModel<typeof contactNotes>;
export type NewContactNote = InferInsertModel<typeof contactNotes>;
