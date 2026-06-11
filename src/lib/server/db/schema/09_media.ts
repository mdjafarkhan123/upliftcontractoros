import { pgTable, pgEnum, uuid, text, integer, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql, type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';
import { jobs } from './04_jobs';
import { quotes, invoices } from './06_revenue';
import { messages } from './05_communication';

export const mediaTypeEnum = pgEnum('media_type', ['photo', 'pdf', 'attachment']);

export const mediaPurposeTagEnum = pgEnum('media_purpose_tag', [
	'job_photo',
	'before',
	'after',
	'marketing_asset',
	'quote_attachment',
	'invoice_attachment',
	'org_logo',
	'message_attachment',
	'contact_attachment',
	'contact_avatar'
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
		job_id: uuid('job_id').references(() => jobs.id),
		quote_id: uuid('quote_id').references(() => quotes.id),
		invoice_id: uuid('invoice_id').references(() => invoices.id),
		message_id: uuid('message_id').references(() => messages.id),
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
		exactlyOneParent: check(
			'media_exactly_one_parent',
			sql`(
			(
				${table.purpose_tag} = 'org_logo'
				AND ${table.contact_id} IS NULL
				AND ${table.job_id} IS NULL
				AND ${table.quote_id} IS NULL
				AND ${table.invoice_id} IS NULL
				AND ${table.message_id} IS NULL
			)
			OR (
				${table.purpose_tag} <> 'org_logo'
				AND (
					(${table.contact_id} IS NOT NULL)::int +
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
