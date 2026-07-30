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
	uniqueIndex,
	foreignKey
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

// Strict Jobber parity (InvoiceStatusTypeEnum). See jobber-05 §2 / jobber-00 §4.
// - draft: created, not sent.
// - sent_not_due: sent to client, due date has NOT passed, nothing paid.
// - awaiting_payment: sent + due-now/no-due-date, OR partially paid (Jobber has no partial status —
//   a part-paid invoice sits here; the partial is expressed via amount_paid/amount_due, not status).
// - past_due: sent, unpaid, past its due date → feeds dunning.
// - paid: full balance paid, OR closed via Mark-Received (received_at set, no payment logged).
// - bad_debt: uncollectible write-off (remaining/full balance); stays on record, off the chase lists.
// We deliberately DROPPED the old 'partially_paid' (folded into awaiting_payment/past_due) and
// 'cancelled' (Jobber has no cancel — the cancel action became a soft-delete, migration 0175).
export const invoiceStatusEnum = pgEnum('invoice_status', [
	'draft',
	'sent_not_due',
	'awaiting_payment',
	'paid',
	'past_due',
	'bad_debt'
]);

// 'stripe' is the internal online-capture method (Stripe Checkout / Payment Link) and is never
// offered in the manual "Add payment" dropdown. The rest are manual record types the contractor
// picks when logging a payment taken outside the app. credit_card + paypal were added to match
// Jobber's payment-type list (ref/invoice/4.jpg): Other, Bank transfer, Cash, Check, Credit/debit
// card, PayPal. Enum values are append-only (ALTER TYPE ADD VALUE) — never reordered/removed.
export const paymentMethodEnum = pgEnum('payment_method', [
	'stripe',
	'cash',
	'check',
	'bank_transfer',
	'other',
	'credit_card',
	'paypal'
]);

// Append-only payment ledger movement type. Positive rows are normal payments; negative rows
// correct/refund/reverse earlier rows without ever mutating the original financial record.
export const paymentAdjustmentTypeEnum = pgEnum('payment_adjustment_type', [
	'payment',
	'refund',
	'correction',
	'failed_payment',
	'bad_debt',
	'void'
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
	// Provenance back-link (Jobber): the Request this quote was converted from, so the
	// quote detail page can show the original request in a side drawer. Set once at
	// conversion, never live-read for pricing (the quote owns its own snapshot lines).
	// Plain uuid, no FK — a constraint here would close an import cycle (19_requests
	// already imports quotes). Same convention as accepted_package_id / booking_link_id.
	request_id: uuid('request_id'),
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
	// Customer-facing Terms & Conditions for THIS quote (payment terms, warranty, scope
	// in/out). Snapshot-copied from organizations.default_quote_terms at create time, then
	// independently editable per quote -- the customer's agreed terms are preserved for
	// disputes. Separate from `notes` (freeform message). Renders as its own titled block on
	// the public quote + PDF. Nullable/empty = no T&C block.
	terms: text('terms'),
	public_token_hash: text('public_token_hash').notNull().unique(),
	// Plaintext copy of the live token, mirroring invoices.public_token. Lets the
	// contractor copy/paste the client link (WhatsApp, iMessage, in person) at any
	// time. Null until a real token is minted (send / resend / copy-link). The public
	// /q/[token] read path still authenticates against public_token_hash, unchanged.
	public_token: text('public_token').unique(),
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
	// Good-Better-Best: which package the customer selected on the public page. NULL on
	// simple quotes (no packages) and on tiered quotes not yet accepted. Set at acceptance
	// (session 1.2). No FK constraint here to avoid a circular table declaration order with
	// quote_packages (declared below); packages are soft-deleted so the id stays resolvable.
	accepted_package_id: uuid('accepted_package_id'),
	// In-person "sign on this device": the customer's drawn signature image (stored in R2 as a
	// media row, purpose_tag 'quote_signature'). NULL on simple / online / offline-marked
	// acceptances. No FK constraint — same circular-import avoidance as accepted_package_id
	// (media is declared in 09_media which imports quotes); media is soft-deleted so the id stays
	// resolvable. Its presence is what marks an acceptance as "Signed in person".
	acceptance_signature_media_id: uuid('acceptance_signature_media_id'),
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
	// On a tiered quote an optional line is scoped to its package (adds to that tier only).
	is_optional: boolean('is_optional').notNull().default(false),
	// Good-Better-Best: the package (tier) this line belongs to. NULL = a simple quote line
	// (no tiers — today's behavior, untouched). On a tiered quote every line carries a
	// package_id, set fresh on each PATCH (packages + lines are soft-deleted and reinserted
	// together, resolving each line's package from the client-sent package_key). ON DELETE SET
	// NULL is defensive only — packages are soft-deleted, never hard-purged.
	package_id: uuid('package_id').references(() => quotePackages.id, {
		onDelete: 'set null'
	}),
	// Set true at acceptance on the optional lines the customer selected. Required lines
	// stay false (they are always part of the deal). Used to build the accepted total and
	// to copy only chosen optionals into an invoice.
	accepted_selected: boolean('accepted_selected').notNull().default(false),
	unit_price: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
	// Per-line sales-tax flag (QuickBooks/Jobber/Housecall model). Only taxable lines feed
	// the quote's tax base; labor is commonly non-taxable while materials are taxable. Default
	// true = every line taxed (preserves the old quote-level behavior). Prefilled from the
	// catalog item's default_taxable when a line is added from the price book.
	taxable: boolean('taxable').notNull().default(true),
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

// Good-Better-Best packages (tiers) on a quote. Industry model = ServiceTitan / Housecall
// Pro "estimate options": ONE quote holds 2–3 mutually-exclusive packages and the customer
// picks exactly ONE. A quote with zero package rows is "simple" (a single flat line list —
// today's behavior, untouched); a quote with 2–3 rows is "tiered". Each package owns a slice
// of quote_line_items (via quote_line_items.package_id) and denormalizes its own base
// subtotal/total (required lines only; optional add-ons add on top at acceptance). The
// quote's headline subtotal/total mirror the RECOMMENDED package (see recalcQuoteTotals).
export const quotePackages = pgTable(
	'quote_packages',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		quote_id: uuid('quote_id')
			.notNull()
			.references(() => quotes.id),
		// Stable client-generated identity that SURVIVES the PATCH wipe-and-reinsert (same role
		// as quote_line_items.line_key). The PATCH route soft-deletes every package + line row
		// and reinserts fresh ones; lines reference their package by this key, which the route
		// maps to the freshly-inserted package id. Defaults to a fresh uuid for safety.
		package_key: uuid('package_key').notNull().defaultRandom(),
		// Tier name shown to the customer (e.g. 'Good', 'Better', 'Best', 'Silver', 'Gold').
		name: varchar('name', { length: 60 }).notNull(),
		// Exactly one package per tiered quote is the recommended/highlighted tier (the middle
		// anchor). The quote's headline totals mirror this package. Enforced at the API layer.
		is_recommended: boolean('is_recommended').notNull().default(false),
		position: integer('position').notNull().default(0),
		// Denormalized base figures for THIS package = its required (non-optional) lines only.
		// subtotal = sum of the package's required line totals; total = subtotal + tax on it
		// (quote-level discount is applied only to the headline/selected package, not here).
		// Recomputed by recalcQuoteTotals whenever lines change.
		subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
		total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
		deleted_at: timestamp('deleted_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('idx_quote_packages_quote_id').on(t.quote_id)]
);

export type QuotePackage = InferSelectModel<typeof quotePackages>;
export type NewQuotePackage = InferInsertModel<typeof quotePackages>;

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
		// Per-line sales-tax flag (mirrors quote_line_items.taxable / invoice_line_items.taxable).
		// Only taxable lines feed the job's tax base — labor is commonly non-taxable while materials
		// are taxable (QuickBooks/Jobber/Housecall model). Auto-filled from the catalog item's
		// default_taxable when a line is added from the price book. Default true = taxable, which
		// preserves the old job-wide tax behavior for every existing line.
		taxable: boolean('taxable').notNull().default(true),
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
		// Default per-line tax flag applied when this item is added to a quote/invoice line
		// (mirrors quote_line_items.taxable). Contractors set Labor → false, Materials → true
		// once, then every line auto-fills correctly. Default true = taxable.
		default_taxable: boolean('default_taxable').notNull().default(true),
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
	// Per-line tax flag, frozen for dispute records. Absent on snapshots taken before
	// per-line tax existed (treat as taxable).
	taxable?: boolean;
	// Good-Better-Best: the tier this line belonged to at snapshot time. Both absent on a
	// simple quote and on snapshots taken before packages existed. Frozen so a past tiered
	// offer can be reconstructed exactly for a dispute.
	package_key?: string | null;
	package_name?: string | null;
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
	// Mirrors quote_line_items.taxable so a template carries its per-line tax flags into a
	// new quote. Default true = taxable.
	taxable: boolean('taxable').notNull().default(true),
	total: numeric('total', { precision: 12, scale: 2 }).notNull(),
	position: integer('position').notNull().default(0),
	deleted_at: timestamp('deleted_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type QuoteTemplateLineItem = InferSelectModel<typeof quoteTemplateLineItems>;
export type NewQuoteTemplateLineItem = InferInsertModel<typeof quoteTemplateLineItems>;

export const invoices = pgTable(
	'invoices',
	{
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
		// Invoice-level discount applied to the subtotal BEFORE tax (mirrors quotes — Jobber /
		// Housecall Pro / QuickBooks). discount_type 'none' = no discount. 'fixed' = discount_value
		// is a dollar amount; 'percent' = a percentage (0-100). discount_amount is the
		// server-computed dollars-off, clamped to the subtotal so the total can never go negative.
		// discount_label is an optional shown reason (e.g. 'Repeat customer', 'Fall promo').
		discount_type: text('discount_type').notNull().default('none'), // 'none' | 'fixed' | 'percent'
		discount_value: numeric('discount_value', { precision: 12, scale: 2 }),
		discount_amount: numeric('discount_amount', { precision: 12, scale: 2 }),
		discount_label: varchar('discount_label', { length: 60 }),
		tax_rate: numeric('tax_rate', { precision: 5, scale: 4 }).notNull().default('0'),
		tax_amount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
		total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
		amount_paid: numeric('amount_paid', { precision: 12, scale: 2 }).notNull().default('0'),
		amount_due: numeric('amount_due', { precision: 12, scale: 2 }).notNull().default('0'),
		// Denormalized running total of tips (gratuity) collected on this invoice's payments
		// (M7). A tip is EXTRA money on top of the balance — it NEVER reduces amount_due or counts
		// toward amount_paid. Recomputed by recalcInvoiceTotals as SUM(payments.tip_amount). Shown
		// as its own row on the invoice/public/PDF when > 0. Default 0 = no tips collected.
		tip_total: numeric('tip_total', { precision: 12, scale: 2 }).notNull().default('0'),
		notes: text('notes'),
		// Customer-facing Terms & Conditions for THIS invoice (payment terms, late fees, warranty).
		// Snapshot-copied from organizations.default_quote_terms at create time, then independently
		// editable per invoice — the agreed terms are preserved for disputes. Separate from `notes`
		// (freeform message). Renders as its own titled block on the public invoice + PDF.
		// Nullable/empty = no T&C block. Mirrors quotes.terms.
		terms: text('terms'),
		public_token: text('public_token').unique(),
		viewed_at: timestamp('viewed_at', { withTimezone: true }),
		due_date: date('due_date'),
		// Per-invoice opt-in for automatic payment reminders (the invoice_dunning sequence).
		// Default true = this invoice follows the org's reminder schedule. Uncheck on a specific
		// invoice to skip reminders for it (e.g. a client who's already promised to pay). Read at
		// invoice.sent enrollment time; toggling it off on an already-sent invoice stops any pending
		// reminders (invoice.reminders_toggled → worker → stopEnrollmentsForResource). The org-level
		// on/off (feature_invoice_reminders + sequence.enabled) still gates everything above this.
		// Matches Jobber / QuickBooks / Housecall Pro per-invoice reminder control.
		send_payment_reminders: boolean('send_payment_reminders').notNull().default(true),
		// Per-invoice opt-in for accepting tips (gratuity) on this invoice. Default true = this
		// invoice accepts tips when the org has tips turned on. Uncheck on a specific invoice to
		// suppress the tip selector for it. The EFFECTIVE gate is org.tips_enabled AND this flag —
		// the org-level toggle (organizations.tips_enabled) is the master switch above this. Mirrors
		// send_payment_reminders. Matches Jobber / QuickBooks / Housecall Pro per-invoice tip control.
		accept_tips: boolean('accept_tips').notNull().default(true),
		// Running total of late fees charged on this invoice (M8). Maintained by recalcInvoiceTotals
		// as the sum of is_late_fee line items. UNLIKE tips (which sit outside amount_due), late fees
		// ARE real money — this amount is added to `total` after tax and flows into amount_due.
		// Excluded from the discount + tax base. '0' when no fee has been applied.
		late_fee_total: numeric('late_fee_total', { precision: 12, scale: 2 }).notNull().default('0'),
		// Per-invoice late-fee terms (M8 Phase 2), SNAPSHOT-copied from the org's late-fee config at
		// create time then independently editable per invoice — so a contractor can waive or change the
		// fee for one client without touching the company default (Jobber / QuickBooks pattern). The
		// EFFECTIVE gate is organizations.late_fee_enabled AND this flag. late_fee_type is 'flat' |
		// 'percent' (snapshot of the org type); late_fee_value is the flat $ when type='flat' OR the
		// percent when type='percent' — one column collapsing the org's two value columns. Both null
		// when the org had no fee configured at create. Drives BOTH the manual "Add late fee" button and
		// the auto-after-grace sweep; neither reads the org config anymore.
		late_fee_enabled: boolean('late_fee_enabled').notNull().default(false),
		late_fee_type: text('late_fee_type'),
		late_fee_value: numeric('late_fee_value', { precision: 12, scale: 2 }),
		stripe_payment_link_url: text('stripe_payment_link_url'),
		stripe_payment_link_id: text('stripe_payment_link_id'),
		sent_at: timestamp('sent_at', { withTimezone: true }),
		paid_at: timestamp('paid_at', { withTimezone: true }),
		// Close-invoice markers (Jobber InvoiceCloseOptionsType). Both closes are reversible.
		// received_at: set when the invoice is closed via MARK_RECEIVED (paid outside the app — status
		// flips to 'paid' with NO payment row logged). Distinguishes a courtesy close from a real
		// collected payment; cleared on reopen. paid_at is also stamped so the invoice reads as settled.
		received_at: timestamp('received_at', { withTimezone: true }),
		// bad_debt_at: set when closed via BAD_DEBT (write-off). written_off_amount snapshots the
		// remaining balance written off at that moment (for reporting). Both cleared on unmark/reopen.
		bad_debt_at: timestamp('bad_debt_at', { withTimezone: true }),
		written_off_amount: numeric('written_off_amount', { precision: 12, scale: 2 }),
		// In-person "sign on this device": the customer's acknowledgement of this invoice, collected
		// by the contractor handing over their device (mirrors quotes.acceptance_signature_*). Purely a
		// record — it never changes status or money. signature_name is the customer's typed full name;
		// signature_media_id is the drawn signature image (stored in R2 as a media row, purpose_tag
		// 'invoice_signature'; no FK — same circular-import avoidance as quotes.acceptance_signature_media_id,
		// media is soft-deleted so the id stays resolvable); signed_at stamps when. All NULL = not signed.
		signature_name: text('signature_name'),
		signature_media_id: uuid('signature_media_id'),
		signed_at: timestamp('signed_at', { withTimezone: true }),
		deleted_at: timestamp('deleted_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		// Per-job billing lookups (jobs-list billing badges, job-detail invoice rollups) filter
		// invoices by job_id; without this the list page runs a seq-scan per row.
		index('idx_invoices_job_id').on(t.job_id)
	]
);

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
	// Optional unit of measure label shown next to the quantity (e.g. 'sq ft', 'hour',
	// 'each'). Display-only — never participates in totals math. Mirrors quote_line_items.unit.
	unit: varchar('unit', { length: 50 }),
	unit_price: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
	// Per-line sales-tax flag (mirrors quote_line_items.taxable). Only taxable lines feed the
	// invoice's tax base. Carried over on quote→invoice conversion so a labor line stays
	// untaxed. Default true = taxable (preserves the old invoice-wide behavior).
	taxable: boolean('taxable').notNull().default(true),
	// Snapshot of the catalog item's cost-to-the-business at the moment this line was added
	// (mirrors quote_line_items.unit_cost). Nullable, internal-only — feeds the private
	// cost/margin panel for revenue-visible members. A SNAPSHOT, never read live.
	unit_cost: numeric('unit_cost', { precision: 12, scale: 2 }),
	// Soft reference back to the catalog item this line was created from (mirrors
	// quote_line_items.source_catalog_item_id). ON DELETE SET NULL — analytics breadcrumb only;
	// the invoice's price/description/unit are always its own copy, never read live.
	source_catalog_item_id: uuid('source_catalog_item_id').references(() => catalogItems.id, {
		onDelete: 'set null'
	}),
	total: numeric('total', { precision: 12, scale: 2 }).notNull(),
	// Flags the synthetic "Late fee" charge line (M8). A late-fee line is EXCLUDED from the
	// discount base and the tax base, but its total is added to the invoice total after tax (see
	// recalcInvoiceTotals). Always non-taxable. Hidden from the editable line-item list + the
	// customer-facing line-item tables; surfaced instead as its own "Late fee" totals row.
	is_late_fee: boolean('is_late_fee').notNull().default(false),
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
export const payments = pgTable(
	'payments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		invoice_id: uuid('invoice_id')
			.notNull()
			.references(() => invoices.id),
		amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
		// What kind of ledger movement this row represents. `payment` rows are positive. Refunds,
		// corrections, failed-payment reversals, bad-debt movements, and voids are stored as NEW rows,
		// usually with negative amount/tip_amount values, linked back via applies_to_payment_id.
		adjustment_type: paymentAdjustmentTypeEnum('adjustment_type').notNull().default('payment'),
		applies_to_payment_id: uuid('applies_to_payment_id'),
		// Tip (gratuity) portion of THIS payment (M7). SEPARATE from `amount` (the balance-applied
		// portion) so a tip never touches amount_due/amount_paid — recalc sums `amount` for the
		// balance and `tip_amount` for tips independently. Set at insert (online: from Stripe
		// metadata; manual: from the record-payment dialog). Default 0 = no tip on this payment.
		tip_amount: numeric('tip_amount', { precision: 12, scale: 2 }).notNull().default('0'),
		payment_method: paymentMethodEnum('payment_method').notNull(),
		stripe_payment_intent_id: text('stripe_payment_intent_id'),
		stripe_refund_id: text('stripe_refund_id'),
		notes: text('notes'),
		recorded_by: uuid('recorded_by').references(() => orgMembers.id),
		paid_at: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
		receipt_sent_at: timestamp('receipt_sent_at', { withTimezone: true }),
		receipt_sent_via: text('receipt_sent_via'),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('idx_payments_stripe_refund_id').on(t.stripe_refund_id),
		index('idx_payments_applies_to_payment_id').on(t.applies_to_payment_id),
		foreignKey({
			columns: [t.applies_to_payment_id],
			foreignColumns: [t.id],
			name: 'payments_applies_to_payment_id_payments_id_fk'
		})
	]
);

export type Payment = InferSelectModel<typeof payments>;
export type NewPayment = InferInsertModel<typeof payments>;

// One-off billing — a job's payment schedule (deposit / milestones). Each row is a planned
// chunk of the job's total; the contractor turns it into a real invoice on demand ("Create"),
// at which point invoice_id is set and the row is locked. The dollar value is NOT stored for
// percent rows — it is derived live from jobs.total and only snapshotted into the invoice line
// at create-time, so the splits always reflect the current total. Industry pattern: Jobber /
// Housecall Pro / Autopilot. Status + balance are derived from the linked invoice, never stored.
export const jobPaymentMilestones = pgTable(
	'job_payment_milestones',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		job_id: uuid('job_id')
			.notNull()
			.references(() => jobs.id),
		// Stable client-generated identity surviving the PATCH wipe-and-reinsert (same role as
		// job_line_items.line_key) — lets an edit preserve already-invoiced rows by matching key.
		key: uuid('key').notNull().defaultRandom(),
		position: integer('position').notNull().default(0),
		// Label shown on the schedule + carried onto the generated invoice (e.g. 'Payment 1').
		description: text('description').notNull(),
		// 'percent' = amount_value is a % of jobs.total (0–100); 'fixed' = a dollar amount.
		amount_type: text('amount_type').notNull().default('percent'), // 'percent' | 'fixed'
		amount_value: numeric('amount_value', { precision: 12, scale: 2 }).notNull(),
		due_date: date('due_date'),
		// Set once "Create" generates this milestone's invoice. NULL = not yet invoiced
		// (status 'Upcoming'). A row with an invoice_id is locked against edit/delete.
		invoice_id: uuid('invoice_id').references(() => invoices.id),
		deleted_at: timestamp('deleted_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('idx_job_payment_milestones_job_id').on(t.job_id)]
);

export type JobPaymentMilestone = InferSelectModel<typeof jobPaymentMilestones>;
export type NewJobPaymentMilestone = InferInsertModel<typeof jobPaymentMilestones>;
