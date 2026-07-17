// Domain 19 — Requests (Jobber-style lead intake)
//
// A Request is the FIRST object in the lead→cash funnel: "a client wishes to
// enlist help for work" (Jobber's words). It captures the ask — title, service
// details, plain line items — and either converts into a quote/job (terminal)
// or gets archived. The on-site Assessment is NOT a table here: it's a regular
// `appointments` row (type 'estimate') carrying a `request_id`, so scheduling,
// crew assignment, reminders, and calendar rendering are all reused as-is.
//
// STATUS IS DERIVED, NEVER STORED (Jobber: "nobody sets it by hand"). This
// table stores only facts — approval state, converted_* (terminal), archived_at
// — and the linked assessment contributes its schedule/completion state. The
// display status (needs_approval / new / unscheduled / upcoming / today /
// overdue / assessment_completed / converted / archived) is computed by
// $lib/server/requests/status.ts.
import {
	pgTable,
	pgEnum,
	uuid,
	text,
	varchar,
	numeric,
	integer,
	boolean,
	timestamp,
	index
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { organizations, orgMembers } from './01_org_identity';
import { contacts } from './02_contacts';
import { jobs } from './04_jobs';
import { quotes, catalogItems } from './06_revenue';

export const requestSourceEnum = pgEnum('request_source', ['internal', 'public_form']);

// Approval gate (Jobber `requiresBookingApproval`): public-form submissions with
// the gate ON arrive as 'pending' ("Needs approval" in the UI) and must be
// accepted/declined by staff before the assessment slot is confirmed. Internal
// requests and gate-off submissions are 'not_required'.
export const requestApprovalStateEnum = pgEnum('request_approval_state', [
	'not_required',
	'pending',
	'accepted',
	'declined'
]);

export const requests = pgTable(
	'requests',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		// NOT NULL — Jobber auto-creates the client (as a lead) the moment a public
		// request arrives, so a request never exists without a contact. The public
		// form flow (R4) dedupes by phone/email before inserting.
		contact_id: uuid('contact_id')
			.notNull()
			.references(() => contacts.id),
		title: text('title').notNull(),
		// "Please provide as much information as you can" — the client's own words
		// describing the work (Overview block on the detail page).
		service_details: text('service_details'),
		// The client's answer to "How did you hear about us?" on the public form.
		// Free text kept verbatim for the Lead Sources report; distinct from the
		// structured contacts.lead_source enum.
		lead_source_answer: text('lead_source_answer'),
		source: requestSourceEnum('source').notNull().default('internal'),
		// Attribution: which public form/link produced this request. NULL for
		// internal requests. Wired up by the public wizard (R4) + form settings (R5).
		// Plain uuid, no FK — importing 12_booking here would close an import cycle
		// (12_booking → 07_appointments → 19_requests). Same convention as
		// appointments.booked_via_link_id.
		booking_link_id: uuid('booking_link_id'),
		approval_state: requestApprovalStateEnum('approval_state').notNull().default('not_required'),
		approval_decided_at: timestamp('approval_decided_at', { withTimezone: true }),
		// Who accepted/declined (accountability). Never nulled on member removal.
		approval_decided_by: uuid('approval_decided_by').references(() => orgMembers.id),
		// ── Conversion (TERMINAL, Jobber rule) ──────────────────────────────────
		// Once converted the request stays Converted forever — even if the quote/job
		// it produced is later deleted. Line items are snapshot-copied at conversion
		// (same philosophy as quote→job); these FKs are provenance, never live-read.
		converted_to_quote_id: uuid('converted_to_quote_id').references(() => quotes.id),
		converted_to_job_id: uuid('converted_to_job_id').references(() => jobs.id),
		converted_at: timestamp('converted_at', { withTimezone: true }),
		// Closed without converting. Also set when a needs-approval request is
		// declined (decline = close). Cleared by unarchive.
		archived_at: timestamp('archived_at', { withTimezone: true }),
		// Internal notes (right-rail Notes block), mirrors jobs.notes.
		notes: text('notes'),
		// When the client asked (editable "Requested on" field on New Request).
		// Defaults to creation time; public submissions stamp their submit time.
		requested_at: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
		// Who entered an internal request. NULL for public-form submissions.
		created_by: uuid('created_by').references(() => orgMembers.id),
		deleted_at: timestamp('deleted_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		// List page scans newest-first per org.
		index('idx_requests_org_created').on(t.org_id, t.created_at),
		// "Requests for this contact" on the contact detail page.
		index('idx_requests_contact').on(t.contact_id, t.org_id)
	]
);

export type Request = InferSelectModel<typeof requests>;
export type NewRequest = InferInsertModel<typeof requests>;

// Plain "what the client asked for" line items (12.jpg Product/Service block).
// Shape mirrors job_line_items so the shared line-item editor plugs in directly
// — but deliberately NO optional/recommended/markup/package flags (those are
// quote-only concepts, per Jobber) and no discount/tax math on the parent: the
// request's total is simply the sum of line totals, computed on read.
export const requestLineItems = pgTable(
	'request_line_items',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		org_id: uuid('org_id')
			.notNull()
			.references(() => organizations.id),
		request_id: uuid('request_id')
			.notNull()
			.references(() => requests.id),
		// Stable client-generated identity surviving the PATCH wipe-and-reinsert
		// (same role as quote_line_items.line_key / job_line_items.line_key).
		line_key: uuid('line_key').notNull().defaultRandom(),
		// The line TITLE (short name of the work/product). Always shown, required.
		description: text('description').notNull(),
		// Optional longer description shown under the title. Display-only.
		details: text('details'),
		quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
		// Optional unit-of-measure label (e.g. 'sq ft', 'hour'). Display-only.
		unit: varchar('unit', { length: 50 }),
		unit_price: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
		// Snapshot of cost-to-business at add time (margin reporting). Never live-read.
		unit_cost: numeric('unit_cost', { precision: 12, scale: 2 }),
		// Per-line sales-tax flag, carried into the quote/job on conversion.
		taxable: boolean('taxable').notNull().default(true),
		// Analytics breadcrumb back to the price-book item. SET NULL on catalog
		// delete; never used to read pricing (the line owns its own copy).
		source_catalog_item_id: uuid('source_catalog_item_id').references(() => catalogItems.id, {
			onDelete: 'set null'
		}),
		total: numeric('total', { precision: 12, scale: 2 }).notNull(),
		position: integer('position').notNull().default(0),
		deleted_at: timestamp('deleted_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('idx_request_line_items_request_id').on(t.request_id)]
);

export type RequestLineItem = InferSelectModel<typeof requestLineItems>;
export type NewRequestLineItem = InferInsertModel<typeof requestLineItems>;
