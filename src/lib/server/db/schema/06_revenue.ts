import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	integer,
	numeric,
	timestamp,
	date
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';
import { opportunities } from './03_pipeline';
import { jobs } from './04_jobs';

export const quoteStatusEnum = pgEnum('quote_status', [
	'draft',
	'sent',
	'viewed',
	'accepted',
	'declined',
	'expired'
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
	subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
	tax_rate: numeric('tax_rate', { precision: 5, scale: 4 }).notNull().default('0'),
	tax_amount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
	total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
	deposit_required: boolean('deposit_required').notNull().default(false),
	deposit_amount: numeric('deposit_amount', { precision: 12, scale: 2 }),
	notes: text('notes'),
	internal_notes: text('internal_notes'),
	public_token_hash: text('public_token_hash').notNull().unique(),
	expires_at: timestamp('expires_at', { withTimezone: true }),
	sent_at: timestamp('sent_at', { withTimezone: true }),
	viewed_at: timestamp('viewed_at', { withTimezone: true }),
	accepted_at: timestamp('accepted_at', { withTimezone: true }),
	declined_at: timestamp('declined_at', { withTimezone: true }),
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

// Append-only view tracking log — no updated_at, no deleted_at
export const quoteViews = pgTable('quote_views', {
	id: uuid('id').primaryKey().defaultRandom(),
	org_id: uuid('org_id')
		.notNull()
		.references(() => organizations.id),
	quote_id: uuid('quote_id')
		.notNull()
		.references(() => quotes.id),
	ip_hash: text('ip_hash'),
	user_agent_hash: text('user_agent_hash'),
	viewed_at: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
	notification_sent: boolean('notification_sent').notNull().default(false),
	notification_sent_at: timestamp('notification_sent_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export type QuoteView = InferSelectModel<typeof quoteViews>;
export type NewQuoteView = InferInsertModel<typeof quoteViews>;

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
	due_date: date('due_date'),
	stripe_payment_link_url: text('stripe_payment_link_url'),
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
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export type Payment = InferSelectModel<typeof payments>;
export type NewPayment = InferInsertModel<typeof payments>;
