import { pgTable, pgEnum, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { jobs } from './04_jobs';
import { quotes, invoices } from './06_revenue';

export const mediaTypeEnum = pgEnum('media_type', ['photo', 'pdf', 'attachment']);

export const mediaPurposeTagEnum = pgEnum('media_purpose_tag', [
	'job_photo',
	'before',
	'after',
	'marketing_asset',
	'quote_attachment',
	'invoice_attachment'
]);

export const media = pgTable('media', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	uploaded_by: uuid('uploaded_by').references(() => orgMembers.id),
	job_id: uuid('job_id').references(() => jobs.id),
	quote_id: uuid('quote_id').references(() => quotes.id),
	invoice_id: uuid('invoice_id').references(() => invoices.id),
	r2_key: text('r2_key').notNull(),
	thumbnail_key: text('thumbnail_key'),
	web_key: text('web_key'),
	original_filename: text('original_filename').notNull(),
	file_size_bytes: integer('file_size_bytes').notNull(),
	media_type: mediaTypeEnum('media_type').notNull(),
	mime_type: text('mime_type').notNull(),
	purpose_tag: mediaPurposeTagEnum('purpose_tag').notNull(),
	scan_status: text('scan_status').notNull().default('pending'),
	sha256_hash: text('sha256_hash'),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
	sha256HashIdx: index('idx_media_sha256_hash').on(table.sha256_hash),
	scanStatusIdx: index('idx_media_scan_status').on(table.scan_status)
}));

export type Media = InferSelectModel<typeof media>;
export type NewMedia = InferInsertModel<typeof media>;
