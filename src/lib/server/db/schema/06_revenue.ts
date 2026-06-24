import {
	pgTable,
	pgEnum,
	uuid,
	text,
	varchar,
	boolean,
	integer,
	numeric,
	timestamp,
	date,
	jsonb,
	index,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts, contactAddresses } from './02_contacts';
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
	// The job site this quote is for. Links (not snapshots) one of the contact's saved
	// addresses — contact_addresses are soft-deleted, so the link always resolves. A
	// merge re-points addresses at the survivor, keeping the link valid. ON DELETE SET
	// NULL is defensive only (a hard contact purge is blocked while quotes exist).
	// Nullable: a quote may have no specific service address.
	service_address_id: uuid('service_address_id').references(() => contactAddresses.id, {
		onDelete: 'set null'
	}),
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
	// Quote-level discount applied to the subtotal BEFORE tax (industry norm: Jobber /
	// Housecall Pro). discount_type 'none' = no discount. 'fixed' = discount_value is a
	// dollar amount; 'percent' = discount_value is a percentage (0–100). discount_amount is
	// the server-computed dollars-off (like deposit_amount) — for a fixed discount it is
	// clamped to the subtotal so the total can never go negative. discount_label is an
	// optional shown reason (e.g. 'Spring promo', 'Senior discount').
	discount_type: text('discount_type').notNull().default('none'), // 'none' | 'fixed' | 'percent'
	discount_value: numeric('discount_value', { precision: 12, scale: 2 }),
	discount_amount: numeric('discount_amount', { precision: 12, scale: 2 }),
	discount_label: varchar('discount_label', { length: 60 }),
	tax_rate: numeric('tax_rate', { precision: 5, scale: 4 }).notNull().default('0'),
	tax_amount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
	total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
	deposit_required: boolean('deposit_required').notNull().default(false),
	deposit_type: text('deposit_type').notNull().default('fixed'), // 'fixed' | 'percent'
	deposit_percent: numeric('deposit_percent', { precision: 5, scale: 2 }),
	deposit_amount: numeric('deposit_amount', { precision: 12, scale: 2 }),
	// Final agreed figures frozen at acceptance = base (required items) + the optional
	// add-ons the customer selected on the public page. Null until accepted. The base
	// subtotal/tax_amount/total above never include optional items (see recalcQuoteTotals);
	// these accepted_* columns are the only place the customer's chosen total lives.
	accepted_subtotal: numeric('accepted_subtotal', { precision: 12, scale: 2 }),
	accepted_tax_amount: numeric('accepted_tax_amount', { precision: 12, scale: 2 }),
	accepted_total: numeric('accepted_total', { precision: 12, scale: 2 }),
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
	acceptance_signature_name: text('acceptance_signature_name'),
	acceptance_signature_ip: text('acceptance_signature_ip'),
	acceptance_signed_at: timestamp('acceptance_signed_at', { withTimezone: true }),
	offline_marked_by: uuid('offline_marked_by').references(() => orgMembers.id),
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
	// Stable, client-generated identity for this line that SURVIVES the save's
	// wipe-and-reinsert (the PATCH route soft-deletes every line row and inserts fresh ones
	// on each edit, so the row `id` is NOT stable across saves). Per-line photos in `media`
	// bind to (quote_id, line_key), so a photo stays glued to its line across edits as long
	// as the re-inserted row carries the same line_key. Defaults to a fresh uuid so legacy
	// rows and any line saved without a key still get a unique identity.
	line_key: uuid('line_key').notNull().defaultRandom(),
	// The line's TITLE — the short name of what's being sold (e.g. "Cedar fence install").
	// (Historically the only text field, hence the column name.) Always shown, required.
	description: text('description').notNull(),
	// Optional longer description shown smaller under the title on the quote/public page/PDF
	// (e.g. scope details, materials, warranty notes). Display-only — never affects totals.
	details: text('details'),
	quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
	// Optional unit of measure label shown next to the quantity (e.g. 'sq ft', 'hour',
	// 'each'). Display-only — never participates in totals math.
	unit: varchar('unit', { length: 50 }),
	// Optional grouping heading (e.g. 'Labor', 'Materials'). Items sharing a label render
	// under one section on the quote, public page, and PDF. Display/organization only --
	// never participates in totals math. Section order derives from `position` (a section's
	// items are kept contiguous). Null = ungrouped.
	section_label: varchar('section_label', { length: 100 }),
	// Optional add-on the customer can choose (check/uncheck) on the public quote before
	// accepting. Optional lines are EXCLUDED from the quote's base subtotal/total — they
	// only add to the accepted total if selected. Default false = a normal required line.
	is_optional: boolean('is_optional').notNull().default(false),
	// Set true at acceptance on the optional lines the customer selected. Required lines
	// stay false (they are always part of the deal). Used to build the accepted total and
	// to copy only chosen optionals into an invoice.
	accepted_selected: boolean('accepted_selected').notNull().default(false),
	unit_price: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
	// Snapshot of the catalog item's cost-to-the-business at the moment this line was
	// added. Nullable, display-never for now (reserved for future profitability/margin
	// reporting). A SNAPSHOT — never read live from the catalog.
	unit_cost: numeric('unit_cost', { precision: 12, scale: 2 }),
	// Soft reference back to the catalog item this line was created from. ON DELETE SET
	// NULL — purely an analytics breadcrumb ("how often is this item quoted"). The
	// quote's price/description/unit are ALWAYS its own copy; this link is never used to
	// read pricing, so archiving/editing a catalog item never mutates sent quotes.
	source_catalog_item_id: uuid('source_catalog_item_id').references(() => catalogItems.id, {
		onDelete: 'set null'
	}),
	total: numeric('total', { precision: 12, scale: 2 }).notNull(),
	position: integer('position').notNull().default(0),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type QuoteLineItem = InferSelectModel<typeof quoteLineItems>;
export type NewQuoteLineItem = InferInsertModel<typeof quoteLineItems>;

// Line items that belong to a JOB. Mirrors quote_line_items but drops the customer-offer-only
// fields (is_optional / accepted_selected) — a job is committed work, not a selectable offer.
// On quote→job conversion the quote's required lines (plus any accepted optionals) are
// SNAPSHOT-copied here; afterwards the job's lines are fully independent of the quote's.
// Lives in this file (not 04_jobs) so it can reference catalog_items without a circular import.
export const jobLineItems = pgTable(
	'job_line_items',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		job_id: uuid('job_id')
			.notNull()
			.references(() => jobs.id),
		// Stable client-generated identity surviving the PATCH wipe-and-reinsert (same role as
		// quote_line_items.line_key). Defaults to a fresh uuid for safety.
		line_key: uuid('line_key').notNull().defaultRandom(),
		// The line TITLE (short name of the work/product). Always shown, required.
		description: text('description').notNull(),
		// Optional longer description shown under the title. Display-only.
		details: text('details'),
		quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
		// Optional unit-of-measure label (e.g. 'sq ft', 'hour'). Display-only.
		unit: varchar('unit', { length: 50 }),
		// Optional grouping heading (e.g. 'Labor', 'Materials'). Display/organization only.
		section_label: varchar('section_label', { length: 100 }),
		unit_price: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
		// Snapshot of cost-to-business at add time (reserved for margin reporting). Never live-read.
		unit_cost: numeric('unit_cost', { precision: 12, scale: 2 }),
		// Analytics breadcrumb back to the price-book item. SET NULL on catalog delete; never used
		// to read pricing (the line owns its own copy).
		source_catalog_item_id: uuid('source_catalog_item_id').references(() => catalogItems.id, {
			onDelete: 'set null'
		}),
		total: numeric('total', { precision: 12, scale: 2 }).notNull(),
		position: integer('position').notNull().default(0),
		deleted_at: timestamp('deleted_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('idx_job_line_items_job_id').on(t.job_id)]
);

export type JobLineItem = InferSelectModel<typeof jobLineItems>;
export type NewJobLineItem = InferInsertModel<typeof jobLineItems>;

// Product / Service Catalog — a reusable, org-scoped library of the things a
// contractor sells (services, products, flat-rate tasks). The universal primitive
// across all trades: one row = one sellable item with a default price + unit.
// When inserted into a quote, its fields are COPIED onto quote_line_items (snapshot);
// the catalog row is never read live for an existing quote's pricing.
export const catalogItems = pgTable(
	'catalog_items',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		name: text('name').notNull(),
		description: text('description'),
		unit_price: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
		// Optional unit of measure label (mirrors quote_line_items.unit): 'each', 'sq ft',
		// 'linear ft', 'visit', 'job', 'hour', etc. Display-only.
		unit: varchar('unit', { length: 50 }),
		// What this item costs the business. Nullable — entered now, surfaced later for
		// profitability/margin. Leaving room without forcing the feature.
		unit_cost: numeric('unit_cost', { precision: 12, scale: 2 }),
		// Free-text grouping label (e.g. 'Roofing', 'HVAC'). Search is the primary way to
		// find items; categories are a secondary filter. No separate categories table.
		category: varchar('category', { length: 100 }),
		// R2 key for the item's thumbnail image. Resolved to a signed URL at read-time via
		// resolveLogoUrl. Null = no image. Same pattern as org logo_url.
		image_url: text('image_url'),
		created_by: uuid('created_by').references(() => orgMembers.id),
		// Soft delete = "archived". Hidden from the picker but kept for history. One concept,
		// consistent with the rest of the schema (no separate active flag).
		deleted_at: timestamp('deleted_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('idx_catalog_items_org_id').on(t.org_id)]
);

export type CatalogItem = InferSelectModel<typeof catalogItems>;
export type NewCatalogItem = InferInsertModel<typeof catalogItems>;

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
	// Optional longer description, frozen into the snapshot. Absent on older snapshots.
	details?: string | null;
	quantity: string;
	unit: string | null;
	section_label: string | null;
	// Optional on older snapshots taken before optional line items existed.
	is_optional?: boolean;
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
	// Title of the template line (mirrors quote_line_items.description).
	description: text('description').notNull(),
	// Optional longer description (mirrors quote_line_items.details). Carries into a quote.
	details: text('details'),
	quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
	// Optional unit of measure label, mirrors quote_line_items.unit.
	unit: varchar('unit', { length: 50 }),
	// Optional grouping heading, mirrors quote_line_items.section_label. Lets a template
	// pre-build sections (e.g. 'Labor', 'Materials') that carry into a new quote.
	section_label: varchar('section_label', { length: 100 }),
	// Mirrors quote_line_items.is_optional so a template can pre-mark add-on lines that
	// carry their optional flag into a new quote.
	is_optional: boolean('is_optional').notNull().default(false),
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
