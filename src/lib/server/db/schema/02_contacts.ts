// `status` is the lifecycle (lead | customer | archived).
// `tags` are operational descriptors (homeowner, company, vip, hot, …).
// Never put lifecycle values inside `tags` — UI vocabulary lives in
// $lib/contacts/tags.ts.
import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	integer,
	jsonb,
	timestamp
} from 'drizzle-orm/pg-core';
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
	'other',
	'inbound_email'
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
	// Review requests are a separate customer preference from SMS consent. A
	// customer can keep receiving service texts while declining review asks.
	receives_review_requests: boolean('receives_review_requests').notNull().default(true),
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

// Bulk CSV import runs as a server-side background job (Jobber/HCP pattern), not
// a single blocking request. One row per uploaded file. The raw CSV lives in R2
// (file_key); the contactImportWorker streams it in batches, updating the
// progress/result counters here as it goes. The UI subscribes to this row via
// Supabase Realtime for live progress and a refresh-proof resume.
//   pending     → uploaded, job enqueued, not yet started
//   processing  → worker is inserting batches
//   completed   → finished (some rows may still have failed — see error_rows)
//   cancelling  → user requested cancel; worker will stop after current batch
//   cancelled   → worker observed the cancel and stopped
//   failed      → worker crashed/aborted (see last_error)
export const contactImportStatusEnum = pgEnum('contact_import_status', [
	'pending',
	'processing',
	'completed',
	'cancelling',
	'cancelled',
	'failed'
]);

// How the worker treats a row that matches an existing contact (by phone OR email):
//   skip   → leave the existing contact untouched, count it as skipped (default)
//   update → overwrite the matched contact's CSV-provided fields, count as updated
export const contactImportOnDuplicateEnum = pgEnum('contact_import_on_duplicate', [
	'skip',
	'update'
]);

export const contactImports = pgTable('contact_imports', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	uploaded_by: uuid('uploaded_by')
		.notNull()
		.references(() => orgMembers.id),
	// R2 object key of the raw uploaded CSV; original filename for display.
	file_key: text('file_key').notNull(),
	file_name: text('file_name').notNull(),
	status: contactImportStatusEnum('status').notNull().default('pending'),
	// Duplicate-handling mode chosen on the import screen (match is phone OR email).
	on_duplicate: contactImportOnDuplicateEnum('on_duplicate').notNull().default('skip'),
	// User's explicit column mapping from the "Map columns" step: an array aligned by
	// CSV column index, each entry the canonical field name that column feeds (e.g.
	// 'phone', 'full_name') or null for "don't import". When present the worker uses
	// THIS instead of auto-guessing headers via HEADER_MAP. Null on older/pre-mapping
	// imports — the worker then falls back to auto-detection.
	column_map: jsonb('column_map').$type<(string | null)[]>(),
	// total_rows = data rows detected at upload; the rest advance as the worker runs.
	total_rows: integer('total_rows').notNull().default(0),
	processed_rows: integer('processed_rows').notNull().default(0),
	imported: integer('imported').notNull().default(0),
	// Rows that matched an existing contact and were overwritten (update mode only).
	updated: integer('updated').notNull().default(0),
	skipped: integer('skipped').notNull().default(0),
	failed: integer('failed').notNull().default(0),
	// Array of { row: number; reason: string } for every rejected row — backs the
	// downloadable failed-rows CSV. Not sliced.
	error_rows: jsonb('error_rows')
		.notNull()
		.default(sql`'[]'::jsonb`),
	// Worker-level fatal error (distinct from per-row errors in error_rows).
	last_error: text('last_error'),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	completed_at: timestamp('completed_at', { withTimezone: true })
});

export type ContactImport = InferSelectModel<typeof contactImports>;
export type NewContactImport = InferInsertModel<typeof contactImports>;
export type ContactImportErrorRow = { row: number; reason: string };
