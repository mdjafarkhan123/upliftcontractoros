import { pgTable, pgEnum, uuid, text, integer, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql, type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';
import { opportunities } from './03_pipeline';
import { jobs } from './04_jobs';
import { quotes, invoices } from './06_revenue';
import { messages } from './05_communication';

export const mediaTypeEnum = pgEnum('media_type', ['photo', 'pdf', 'attachment']);

export const mediaPurposeTagEnum = pgEnum('media_purpose_tag', [
	'job_photo',
	'before',
	'after',
	'catalog_item_photo',
	'marketing_asset',
	'quote_attachment',
	'invoice_attachment',
	'org_logo',
	'message_attachment',
	'contact_attachment',
	'contact_avatar',
	'org_signature',
	'opportunity_attachment',
	'quote_line_item_photo',
	// Bound to a job (job_id) with the filled form field's id in `line_key`. Photos + a
	// captured signature attached to a job_form_submission_field. Hidden from the Files tab.
	'job_form_photo',
	'job_form_signature',
	// Bound to a job (job_id) with the visit's appointment id in `line_key`. Photos captured
	// against a single visit when the crew completes it (S5 per-visit completion). Hidden from
	// the Files tab — managed inline on the visit.
	'job_visit_photo',
	// Bound to a job (job_id, no line_key — one per job). The customer's drawn sign-off
	// signature approving the completed work (S6 client sign-off). Hidden from the Files tab.
	'job_signoff_signature',
	// Bound to a quote (quote_id, no line_key — one per quote). The customer's drawn signature
	// captured in person on the tech's device when they approve the quote ("close in the field").
	// Referenced by quotes.acceptance_signature_media_id. Hidden from the Files tab.
	'quote_signature'
]);

export const media = pgTable(
	'media',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		uploaded_by: uuid('uploaded_by').references(() => orgMembers.id),
		contact_id: uuid('contact_id').references(() => contacts.id),
		opportunity_id: uuid('opportunity_id').references(() => opportunities.id),
		job_id: uuid('job_id').references(() => jobs.id),
		quote_id: uuid('quote_id').references(() => quotes.id),
		invoice_id: uuid('invoice_id').references(() => invoices.id),
		message_id: uuid('message_id').references(() => messages.id),
		// Discriminator for `quote_line_item_photo` media: binds the photo to a specific quote
		// line by its stable `quote_line_items.line_key` (the parent FK stays `quote_id`, so the
		// exactly-one-parent CHECK is satisfied). Null for every other purpose tag.
		line_key: uuid('line_key'),
		r2_key: text('r2_key').notNull(),
		thumbnail_key: text('thumbnail_key'),
		web_key: text('web_key'),
		original_filename: text('original_filename').notNull(),
		file_size_bytes: integer('file_size_bytes').notNull(),
		media_type: mediaTypeEnum('media_type').notNull(),
		mime_type: text('mime_type').notNull(),
		purpose_tag: mediaPurposeTagEnum('purpose_tag').notNull(),
		scan_status: text('scan_status').notNull().default('pending'),
		sha256_hash: text('sha256_hash').notNull(),
		deleted_at: timestamp('deleted_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		sha256HashIdx: index('idx_media_sha256_hash').on(table.sha256_hash),
		scanStatusIdx: index('idx_media_scan_status').on(table.scan_status),
		contactIdx: index('idx_media_contact')
			.on(table.contact_id)
			.where(sql`${table.contact_id} IS NOT NULL`),
		opportunityIdx: index('idx_media_opportunity')
			.on(table.opportunity_id)
			.where(sql`${table.opportunity_id} IS NOT NULL`),
		exactlyOneParent: check(
			'media_exactly_one_parent',
			sql`(
			(
				${table.purpose_tag}::text IN ('org_logo', 'org_signature', 'catalog_item_photo')
				AND ${table.contact_id} IS NULL
				AND ${table.opportunity_id} IS NULL
				AND ${table.job_id} IS NULL
				AND ${table.quote_id} IS NULL
				AND ${table.invoice_id} IS NULL
				AND ${table.message_id} IS NULL
			)
			OR (
				${table.purpose_tag}::text NOT IN ('org_logo', 'org_signature', 'catalog_item_photo')
				AND (
					(${table.contact_id} IS NOT NULL)::int +
					(${table.opportunity_id} IS NOT NULL)::int +
					(${table.job_id} IS NOT NULL)::int +
					(${table.quote_id} IS NOT NULL)::int +
					(${table.invoice_id} IS NOT NULL)::int +
					(${table.message_id} IS NOT NULL)::int = 1
				)
			)
		)`
		)
	})
);

export type Media = InferSelectModel<typeof media>;
export type NewMedia = InferInsertModel<typeof media>;
