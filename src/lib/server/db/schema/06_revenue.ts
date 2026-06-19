import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	integer,
	numeric,
	timestamp,
	date,
	jsonb,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';
import { opportunities, pipelineLostReasonEnum } from './03_pipeline';
import { jobs } from './04_jobs';

export const quoteStatusEnum = pgEnum('quote_status', [
	'draft',
	'sent',
	'viewed',
	'accepted',
	'declined',
	'expired',
	'changes_requested'
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
	'draft',
	'sent',
	'partially_paid',
	'paid',
	'overdue',
	'cancelled'
]);

export const paymentMethodEnum = pgEnum('payment_method', [
	'stripe',
	'cash',
	'check',
	'bank_transfer',
	'other'
]);

export const quotes = pgTable('quotes', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	contact_id: uuid('contact_id')
		.notNull()
		.references(() => contacts.id),
	opportunity_id: uuid('opportunity_id').references(() => opportunities.id),
	issued_by: uuid('issued_by').references(() => orgMembers.id),
	quote_number: integer('quote_number').notNull(),
	title: text('title').notNull(),
	status: quoteStatusEnum('status').notNull().default('draft'),
	// Current version number, denormalized pointer to the latest quote_versions row.
	// Bumps only when a quote is re-sent out of changes_requested (i.e. a real revision),
	// never on a plain re-delivery of unchanged content. See quote_versions.
	current_version: integer('current_version').notNull().default(1),
	subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
	tax_rate: numeric('tax_rate', { precision: 5, scale: 4 }).notNull().default('0'),
	tax_amount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
	total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
	deposit_required: boolean('deposit_required').notNull().default(false),
	deposit_amount: numeric('deposit_amount', { precision: 12, scale: 2 }),
	deposit_paid_amount: integer('deposit_paid_amount').notNull().default(0),
	deposit_paid_at: timestamp('deposit_paid_at', { withTimezone: true }),
	deposit_stripe_payment_intent_id: text('deposit_stripe_payment_intent_id'),
	deposit_applied_invoice_id: uuid('deposit_applied_invoice_id'),
	notes: text('notes'),
	internal_notes: text('internal_notes'),
	public_token_hash: text('public_token_hash').notNull().unique(),
	expires_at: timestamp('expires_at', { withTimezone: true }),
	sent_at: timestamp('sent_at', { withTimezone: true }),
	viewed_at: timestamp('viewed_at', { withTimezone: true }),
	accepted_at: timestamp('accepted_at', { withTimezone: true }),
	declined_at: timestamp('declined_at', { withTimezone: true }),
	// Reason the client picked when declining on the public quote page. Reuses the
	// pipeline lost-reason enum so it maps 1:1 onto opportunities.lost_reason.
	decline_reason: pipelineLostReasonEnum('decline_reason'),
	decline_reason_note: text('decline_reason_note'),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type Quote = InferSelectModel<typeof quotes>;
export type NewQuote = InferInsertModel<typeof quotes>;

export const quoteLineItems = pgTable('quote_line_items', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	quote_id: uuid('quote_id')
		.notNull()
		.references(() => quotes.id),
	description: text('description').notNull(),
	quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
	unit_price: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
	total: numeric('total', { precision: 12, scale: 2 }).notNull(),
	position: integer('position').notNull().default(0),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type QuoteLineItem = InferSelectModel<typeof quoteLineItems>;
export type NewQuoteLineItem = InferInsertModel<typeof quoteLineItems>;

// Frozen snapshot of a quote at the moment it was sent. Immutable dispute record —
// no updated_at, no deleted_at. One row per send (v1) and per re-send out of
// changes_requested (v2, v3…). Captures the totals AND a JSON snapshot of the line
// items so a past version can be reconstructed exactly ("v3 was $11,500 and you
// accepted it"). line_items shape mirrors quote_line_items display fields.
export const quoteVersions = pgTable(
	'quote_versions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		quote_id: uuid('quote_id')
			.notNull()
			.references(() => quotes.id),
		version: integer('version').notNull(),
		subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
		tax_rate: numeric('tax_rate', { precision: 5, scale: 4 }).notNull(),
		tax_amount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull(),
		total: numeric('total', { precision: 12, scale: 2 }).notNull(),
		line_items: jsonb('line_items').notNull(),
		sent_at: timestamp('sent_at', { withTimezone: true }).notNull(),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('quote_versions_quote_version_uq').on(t.quote_id, t.version)]
);

export type QuoteVersion = InferSelectModel<typeof quoteVersions>;
export type NewQuoteVersion = InferInsertModel<typeof quoteVersions>;

// A single frozen line item inside quote_versions.line_items (jsonb array).
export type QuoteVersionLineItem = {
	description: string;
	quantity: string;
	unit_price: string;
	total: string;
	position: number;
};

// Append-only view tracking log — no updated_at, no deleted_at
export const quoteViews = pgTable('quote_views', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	quote_id: uuid('quote_id')
		.notNull()
		.references(() => quotes.id),
	// Quote version that was live when this view happened — anchors the view to a
	// version in the history timeline. Defaults to 1 for backfilled pre-versioning rows.
	version: integer('version').notNull().default(1),
	ip_hash: text('ip_hash'),
	user_agent_hash: text('user_agent_hash'),
	viewed_at: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
	notification_sent: boolean('notification_sent').notNull().default(false),
	notification_sent_at: timestamp('notification_sent_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export type QuoteView = InferSelectModel<typeof quoteViews>;
export type NewQuoteView = InferInsertModel<typeof quoteViews>;

// Active customer requests for quote changes. Operational log. No soft delete.
// Partial unique index in migration ensures at most one unresolved request per quote.
export const quoteChangeRequests = pgTable('quote_change_requests', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id, { onDelete: 'cascade' }),
	quote_id: uuid('quote_id')
		.notNull()
		.references(() => quotes.id, { onDelete: 'cascade' }),
	// Quote version that was live when the client requested changes — anchors the
	// revision-requested event to a version in the history timeline.
	version: integer('version').notNull().default(1),
	message: text('message').notNull(),
	requested_at: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
	resolved_at: timestamp('resolved_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export type QuoteChangeRequest = InferSelectModel<typeof quoteChangeRequests>;
export type NewQuoteChangeRequest = InferInsertModel<typeof quoteChangeRequests>;

export const quoteTemplates = pgTable('quote_templates', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	name: text('name').notNull(),
	description: text('description'),
	created_by: uuid('created_by').references(() => orgMembers.id),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type QuoteTemplate = InferSelectModel<typeof quoteTemplates>;
export type NewQuoteTemplate = InferInsertModel<typeof quoteTemplates>;

export const quoteTemplateLineItems = pgTable('quote_template_line_items', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	template_id: uuid('template_id')
		.notNull()
		.references(() => quoteTemplates.id),
	description: text('description').notNull(),
	quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
	unit_price: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
	total: numeric('total', { precision: 12, scale: 2 }).notNull(),
	position: integer('position').notNull().default(0),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type QuoteTemplateLineItem = InferSelectModel<typeof quoteTemplateLineItems>;
export type NewQuoteTemplateLineItem = InferInsertModel<typeof quoteTemplateLineItems>;

export const invoices = pgTable('invoices', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	contact_id: uuid('contact_id')
		.notNull()
		.references(() => contacts.id),
	job_id: uuid('job_id').references(() => jobs.id),
	opportunity_id: uuid('opportunity_id').references(() => opportunities.id),
	quote_id: uuid('quote_id').references(() => quotes.id),
	issued_by: uuid('issued_by').references(() => orgMembers.id),
	invoice_number: integer('invoice_number').notNull(),
	title: text('title').notNull(),
	status: invoiceStatusEnum('status').notNull().default('draft'),
	subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
	tax_rate: numeric('tax_rate', { precision: 5, scale: 4 }).notNull().default('0'),
	tax_amount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
	total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
	amount_paid: numeric('amount_paid', { precision: 12, scale: 2 }).notNull().default('0'),
	amount_due: numeric('amount_due', { precision: 12, scale: 2 }).notNull().default('0'),
	notes: text('notes'),
	public_token: text('public_token').unique(),
	viewed_at: timestamp('viewed_at', { withTimezone: true }),
	due_date: date('due_date'),
	stripe_payment_link_url: text('stripe_payment_link_url'),
	stripe_payment_link_id: text('stripe_payment_link_id'),
	sent_at: timestamp('sent_at', { withTimezone: true }),
	paid_at: timestamp('paid_at', { withTimezone: true }),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type Invoice = InferSelectModel<typeof invoices>;
export type NewInvoice = InferInsertModel<typeof invoices>;

export const invoiceLineItems = pgTable('invoice_line_items', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	invoice_id: uuid('invoice_id')
		.notNull()
		.references(() => invoices.id),
	description: text('description').notNull(),
	quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
	unit_price: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
	total: numeric('total', { precision: 12, scale: 2 }).notNull(),
	position: integer('position').notNull().default(0),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type InvoiceLineItem = InferSelectModel<typeof invoiceLineItems>;
export type NewInvoiceLineItem = InferInsertModel<typeof invoiceLineItems>;

// Append-only view tracking log — no updated_at, no deleted_at
// Mirrors quote_views. Only first qualifying view triggers invoice.viewed event.
export const invoiceViews = pgTable('invoice_views', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	invoice_id: uuid('invoice_id')
		.notNull()
		.references(() => invoices.id),
	ip_hash: text('ip_hash'),
	user_agent_hash: text('user_agent_hash'),
	viewed_at: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
	notification_sent: boolean('notification_sent').notNull().default(false),
	notification_sent_at: timestamp('notification_sent_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export type InvoiceView = InferSelectModel<typeof invoiceViews>;
export type NewInvoiceView = InferInsertModel<typeof invoiceViews>;

// Immutable financial records — no updated_at, no deleted_at
export const payments = pgTable('payments', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	invoice_id: uuid('invoice_id')
		.notNull()
		.references(() => invoices.id),
	amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
	payment_method: paymentMethodEnum('payment_method').notNull(),
	stripe_payment_intent_id: text('stripe_payment_intent_id'),
	notes: text('notes'),
	recorded_by: uuid('recorded_by').references(() => orgMembers.id),
	paid_at: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
	receipt_sent_at: timestamp('receipt_sent_at', { withTimezone: true }),
	receipt_sent_via: text('receipt_sent_via'),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export type Payment = InferSelectModel<typeof payments>;
export type NewPayment = InferInsertModel<typeof payments>;
