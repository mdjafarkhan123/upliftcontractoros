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

// Sales-priority signal, distinct from lifecycle `status`. Nullable = not yet
// triaged. Lets the team sort/filter the follow-up queue by how warm a lead is.
export const leadTemperatureEnum = pgEnum('lead_temperature', ['hot', 'warm', 'cold']);

// Type label for the secondary number (alt_phone). Fixed set — matches the
// Jobber/GHL convention of a phone *type*, never a freeform name. Nullable =
// unlabeled (UI falls back to a generic "alt" tag).
export const phoneLabelEnum = pgEnum('phone_label', ['mobile', 'home', 'work', 'fax', 'other']);

export const leadSourceTypeEnum = pgEnum('lead_source_type', [
	'website_form',
	'live_chat',
	'missed_call',
	'manual',
	'referral',
	'google_ads',
	'yelp',
	'angi',
	'facebook',
	'nextdoor',
	'door_hanger',
	'job_sign',
	'repeat_customer',
	'other'
]);

export const contacts = pgTable('contacts', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	full_name: text('full_name').notNull(),
	// Business/organization name. Property managers, HOAs, and investors are
	// companies, not individuals — `full_name` stays the person/primary contact.
	company_name: text('company_name'),
	email: text('email'),
	// Contact profile photo. Stores the R2 object key of the processed image
	// (same convention as organizations.logo_url) — resolved to a short-lived
	// signed URL on read via resolveLogoUrl(). The backing media row is
	// org-scoped (no contact FK) so it never appears in the Files tab.
	avatar_url: text('avatar_url'),
	// Nullable since the Messenger channel: a PSID-only contact has no phone.
	// Phone remains the dedup key (UNIQUE(org_id, phone)) ONLY when present.
	// Downstream phone-assumption fixes are tracked separately and deferred.
	phone: text('phone'),
	// Secondary callable/searchable number. Populated by the merge-duplicates
	// flow when the absorbed (source) contact had a different phone than the
	// survivor, so the second number is never lost. Not subject to the
	// (org_id, phone) uniqueness constraint — only `phone` is the dedup key.
	alt_phone: text('alt_phone'),
	// Type of the secondary number (mobile/home/work/fax/other). Nullable when the
	// alt number is unlabeled. Always cleared together with alt_phone.
	alt_phone_label: phoneLabelEnum('alt_phone_label'),
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
	// Hard "block all outreach" flag — distinct from SMS opt-out. Set manually by
	// staff (legal request, abusive contact, explicit request). Blocks all channels.
	do_not_contact: boolean('do_not_contact').notNull().default(false),
	do_not_contact_at: timestamp('do_not_contact_at', { withTimezone: true }),
	lead_source: leadSourceTypeEnum('lead_source').notNull().default('manual'),
	lead_temperature: leadTemperatureEnum('lead_temperature'),
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
