import type { JobRecurrence } from '$lib/jobs/recurrence';

export type JobStatus = 'scheduled' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
export type JobSource = 'opportunity' | 'manual';

export type JobListItem = {
	id: string;
	title: string;
	status: JobStatus;
	source: JobSource;
	contact_id: string;
	contact_name: string;
	assigned_to: string | null;
	assignee_name: string | null;
	scheduled_start: string | null;
	scheduled_end: string | null;
	created_at: string;
	// Set only in the recycle-bin view (deleted=1); null on active rows.
	deleted_at: string | null;
	// Redesigned list row (Contacts-style table): total value + service address columns.
	// total is a numeric string. Recurrence flag distinguishes one-off vs recurring at a glance.
	total: string;
	is_recurring: boolean;
	service_address_line_1: string | null;
	service_address_city: string | null;
	service_address_state: string | null;
	service_address_zip: string | null;
	// Billing badge signals (BILLING.md). Server-computed aggregates over the job's invoices,
	// payment-schedule milestones and visits; `deriveJobBillingBadge` turns them into at most one
	// badge + an optional payment-progress bar. See src/lib/jobs/billing.ts.
	billing: JobBillingSignals;
};

// At most one billing badge per job row, describing the single most important next money action.
export type JobBillingBadge = 'overdue' | 'needs_invoice' | 'awaiting_payment' | 'paid';

// Server-derived booleans + the money-collected figure that feed the badge + progress bar. All
// aggregates ignore soft-deleted and cancelled invoices. Kept as flat primitives so the list
// query can compute them per row and the client helper stays pure math.
export type JobBillingSignals = {
	// An invoice is past its due date with a balance owing (matches isEffectivelyOverdue).
	has_overdue: boolean;
	// The next invoice can be created or sent: a draft to send, an un-invoiced milestone, a
	// completed one-off with no invoice, or a recurring visit-based job with an unbilled past visit.
	needs_invoice: boolean;
	// A sent invoice still has money outstanding (not overdue).
	has_unpaid_sent: boolean;
	// At least one non-cancelled invoice exists and none has a balance remaining.
	all_settled: boolean;
	// Total money collected across the job's non-cancelled invoices (numeric string) — the
	// numerator of the payment-progress bar (denominator is the job total).
	total_paid: string;
};

export type ReviewRequestStatus = 'pending' | 'sent' | 'responded' | 'failed' | 'no_response';

// A line item on a job, as served to the UI. Mirrors the quote line shape minus offer-only
// fields. quantity/unit_price/total are numeric strings (numeric columns).
export type JobLineItemRow = {
	line_key: string;
	description: string;
	details: string | null;
	quantity: string;
	unit: string | null;
	section_label: string | null;
	unit_price: string;
	unit_cost: string | null;
	taxable: boolean;
	source_catalog_item_id: string | null;
	total: string;
	position: number;
};

// A payment-schedule milestone (one-off billing), as served to the UI. Joined to its linked
// invoice so the client can derive the row status + balance. amount_value is a numeric string:
// a percentage (0–100) when amount_type='percent', a flat dollar amount when 'fixed'.
export type JobPaymentMilestoneRow = {
	id: string;
	key: string;
	position: number;
	description: string;
	amount_type: 'percent' | 'fixed';
	amount_value: string;
	due_date: string | null;
	// Invoice linkage — null until the milestone is turned into an invoice ("Create").
	invoice_id: string | null;
	invoice_number: number | null;
	invoice_status: 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled' | null;
	invoice_total: string | null;
	invoice_amount_paid: string | null;
};

// Job costing (Session 1). What the work cost, logged as out-of-pocket expense rows on top of
// line-item material cost. category groups the spend; amount is a numeric string (> 0);
// expense_date is a 'YYYY-MM-DD' calendar day. created_by_name is the member who logged it.
export type JobExpenseCategory = 'materials' | 'labor' | 'subcontractor' | 'equipment' | 'other';

export type JobExpenseRow = {
	id: string;
	category: JobExpenseCategory;
	description: string;
	amount: string;
	expense_date: string;
	notes: string | null;
	created_by_name: string | null;
	created_at: string;
};

// A time-tracking entry (Session 2). duration_minutes/hourly_rate_snapshot are numeric strings,
// both null while the timer is still running (clock_out === null). cost_amount is a
// server-derived display convenience (duration × rate) — null when either input is missing, or
// when this viewer can't see revenue (cost stripped, hours still shown).
export type JobTimeEntryRow = {
	id: string;
	org_member_id: string;
	member_name: string;
	clock_in: string;
	clock_out: string | null;
	duration_minutes: string | null;
	hourly_rate_snapshot: string | null;
	cost_amount: string | null;
	notes: string | null;
	created_by_name: string | null;
	created_at: string;
};

// A checklist task on a job (Session 3, Jobber "Tasks"). completed drives the checkbox;
// completed_at/completed_by are stamped when ticked (cleared when un-ticked). assigned_to +
// due_date are optional. member names are joined for display. position orders the list.
// Purely operational — always returned to anyone who can view the job.
export type JobTaskRow = {
	id: string;
	title: string;
	completed: boolean;
	completed_at: string | null;
	completed_by: string | null;
	completed_by_name: string | null;
	assigned_to: string | null;
	assignee_name: string | null;
	due_date: string | null;
	position: string;
	created_at: string;
};

// Server-computed profitability for a job. All money fields are numeric strings; margin_pct is a
// whole-number percent, or null when revenue is 0 (margin is undefined). revenue = subtotal −
// discount (pre-tax work value); cost_total = line-item cost + labor + expenses. Present on
// JobDetail only for members who can see revenue/cost (null-blanked otherwise).
export type JobCosting = {
	revenue: string;
	line_item_cost: string;
	labor_cost: string;
	expense_total: string;
	cost_total: string;
	profit: string;
	margin_pct: number | null;
};

// Job forms (Session 4.2). A template filled on a job. `field_type` mirrors the template's
// enum; the field DEFINITION is a frozen snapshot taken at attach time, and the value_* fields
// carry the crew's answer (typed by field_type; all null until filled). 'section' fields carry
// no answer. Photo/signature capture is wired in S4.2b.
export type JobFormFieldType =
	| 'section'
	| 'short_text'
	| 'long_text'
	| 'number'
	| 'checkbox'
	| 'dropdown'
	| 'date'
	| 'photo'
	| 'signature';

export type JobFormSubmissionStatus = 'in_progress' | 'completed';

// A photo or captured signature attached to a photo/signature field, with short-lived signed
// R2 URLs (thumbnail for the grid, web/full for the lightbox). Bound to the field via line_key.
export type JobFormFieldMedia = {
	id: string;
	purpose_tag: 'job_form_photo' | 'job_form_signature';
	thumb_url: string;
	full_url: string;
};

// Client sign-off (Session 6) — the customer's on-site approval of the completed work.
// `signature` is the drawn signature image (short-lived signed R2 URLs); `signer_name` +
// `signed_at` record who signed and when. `signed_at === null` means not yet signed.
export type JobSignoff = {
	signer_name: string | null;
	signed_at: string | null;
	signature: { id: string; thumb_url: string; full_url: string } | null;
};

export type JobFormSubmissionFieldRow = {
	id: string;
	field_type: JobFormFieldType;
	label: string;
	help_text: string | null;
	required: boolean;
	options: string[] | null;
	position: number;
	// Answer, typed by field_type. value_text: short_text/long_text/dropdown. value_number:
	// number (numeric string). value_bool: checkbox. value_date: 'YYYY-MM-DD'.
	value_text: string | null;
	value_number: string | null;
	value_bool: boolean | null;
	value_date: string | null;
	// Attached files for photo/signature fields (empty for every other type).
	media: JobFormFieldMedia[];
};

export type JobFormSubmissionRow = {
	id: string;
	template_id: string | null;
	template_name: string;
	status: JobFormSubmissionStatus;
	submitted_at: string | null;
	submitted_by_name: string | null;
	created_by_name: string | null;
	created_at: string;
	updated_at: string;
	fields: JobFormSubmissionFieldRow[];
};

// A photo captured against a single job visit, with short-lived signed R2 URLs (S5).
export type JobVisitPhoto = {
	id: string;
	thumb_url: string;
	full_url: string;
};

export type JobVisitStatus =
	| 'scheduled'
	| 'unscheduled'
	| 'completed'
	| 'cancelled'
	| 'no_show';

// One visit (appointment) on a job, with its per-visit completion record + photos (S5).
export type JobVisitRow = {
	id: string;
	type: string;
	status: JobVisitStatus;
	title: string;
	// NULL for an unscheduled visit (Jobber "Schedule later") — no date yet.
	scheduled_start: string | null;
	scheduled_end: string | null;
	location: string | null;
	// Up-front scheduling / visit instructions (set at creation).
	notes: string | null;
	assignee_name: string | null;
	// Per-visit completion record. Populated once the visit is marked completed.
	completed_at: string | null;
	completed_by_name: string | null;
	completion_notes: string | null;
	// True when this visit has already been rolled into a generated invoice (recurring billing).
	billed: boolean;
	photos: JobVisitPhoto[];
};

// Custom fields (Session 7). Org-defined extra fields shown on every job (Jobber "Custom
// Fields"). `field_type` is fixed at creation. `options` only for dropdown. Live metadata —
// NOT snapshotted per job (unlike job forms).
export type JobCustomFieldType = 'short_text' | 'number' | 'date' | 'dropdown' | 'checkbox' | 'link';

// A custom-field definition as managed in Settings.
export type JobCustomFieldDef = {
	id: string;
	field_type: JobCustomFieldType;
	label: string;
	help_text: string | null;
	required: boolean;
	options: string[] | null;
	position: string;
	created_by_name: string | null;
	created_at: string;
	updated_at: string;
};

// A custom-field definition joined with THIS job's value (all value_* null until filled).
// Typed by field_type: value_text (short_text/dropdown/link), value_number (number, numeric
// string), value_bool (checkbox), value_date ('YYYY-MM-DD').
export type JobCustomFieldRow = {
	id: string; // the definition id (values are keyed to it)
	field_type: JobCustomFieldType;
	label: string;
	help_text: string | null;
	required: boolean;
	options: string[] | null;
	position: string;
	value_text: string | null;
	value_number: string | null;
	value_bool: boolean | null;
	value_date: string | null;
};

// One custom-field value as sent to the API (create form + values PATCH). Only the column
// matching the field's type is honored server-side; the rest are ignored.
export type JobCustomFieldValuePayload = {
	field_id: string;
	value_text?: string | null;
	value_number?: number | null;
	value_bool?: boolean | null;
	value_date?: string | null;
};

// A pickable template for the "Add form" menu on a job (id + name only).
export type JobFormTemplateOption = {
	id: string;
	name: string;
	description: string | null;
	field_count: number;
};

export type JobDetail = {
	id: string;
	title: string;
	status: JobStatus;
	contact_id: string;
	contact_name: string;
	contact_phone: string;
	contact_email: string | null;
	opportunity_id: string | null;
	source: JobSource;
	assigned_to: string | null;
	assignee_name: string | null;
	job_type: string | null;
	tags: string[];
	notes: string | null;
	scope_of_work: string | null;
	service_address_line_1: string | null;
	service_address_line_2: string | null;
	service_address_city: string | null;
	service_address_state: string | null;
	service_address_zip: string | null;
	scheduled_start: string | null;
	scheduled_end: string | null;
	recurrence: JobRecurrence | null;
	completed_at: string | null;
	cancelled_at: string | null;
	created_at: string;
	updated_at: string;
	// Pricing snapshot (numeric strings).
	subtotal: string;
	discount_type: string;
	discount_value: string | null;
	discount_amount: string | null;
	discount_label: string | null;
	tax_rate: string;
	tax_amount: string;
	total: string;
	line_items: JobLineItemRow[];
	// One-off billing (S3): close-reminder flag + the payment schedule.
	invoice_on_close: boolean;
	payment_milestones: JobPaymentMilestoneRow[];
	// Recurring billing (S4): null billing_type = recurring billing not set up.
	// fixed_invoice_amount is a numeric string (only meaningful when billing_type='fixed').
	billing_type: 'visit_based' | 'fixed' | null;
	invoice_frequency: 'per_visit' | 'weekly' | 'biweekly' | 'monthly' | null;
	fixed_invoice_amount: string | null;
	invoice_count: number;
	// Whether a non-cancelled invoice already exists for this job (drives Create vs View invoice).
	has_active_invoice: boolean;
	appointment_count: number;
	review_request_status: ReviewRequestStatus | null;
	// Job costing (Session 1). Cost is private — both are null for members without revenue access.
	expenses: JobExpenseRow[];
	costing: JobCosting | null;
	// Time tracking (Session 2). Always present for anyone who can view the job — hours worked
	// are operational, not financial. cost_amount/hourly_rate_snapshot inside each row are
	// stripped to null for members without revenue access.
	time_entries: JobTimeEntryRow[];
	// Tasks / checklist (Session 3). Always present for anyone who can view the job — a
	// checklist is operational, carries no money, and the crew ticks it off in the field.
	tasks: JobTaskRow[];
	// Job forms (Session 4.2). Filled inspection/checklist forms attached to the job.
	// Operational — always returned to anyone who can view the job. Each carries its own
	// snapshotted fields + answers.
	form_submissions: JobFormSubmissionRow[];
	// Client sign-off (Session 6). The customer's approval of the completed work — always
	// present (signed_at === null when not yet captured). Operational, no cost gating.
	signoff: JobSignoff;
	// Custom fields (Session 7). Every org-defined field with this job's value merged in.
	// Operational — always returned to anyone who can view the job. Empty when the org has
	// defined none.
	custom_fields: JobCustomFieldRow[];
};

// Redesign tabs: all date-derived faces of a 'scheduled' job (status 'scheduled' in the DB):
//   pending = no date yet · upcoming = future date · today = today's date · overdue = date passed.
// The rest map 1:1 to stored statuses. 'awaiting_review'/'today'/'unscheduled' scopes remain in
// JobsFilterScope for the legacy scope chips.
export type JobsFilterStatus =
	| 'all'
	| 'pending'
	| 'upcoming'
	| 'today'
	| 'overdue'
	| 'in_progress'
	| 'on_hold'
	| 'completed'
	| 'cancelled'
	// Recycle-bin tab: soft-deleted jobs (deleted=1). Not a real job status.
	| 'deleted';

export type JobsFilterScope = 'today' | 'awaiting_review' | 'unscheduled';

export type JobsFilters = {
	status: JobsFilterStatus;
	scope: JobsFilterScope | null;
	assignedTo: string | null;
	contactId: string | null;
	search: string;
	// Advanced filter dropdown (Session 2 UI). All optional — current page omits them.
	dateFrom?: string | null; // ISO date (inclusive) against scheduled_start
	dateTo?: string | null; // ISO date (inclusive) against scheduled_start
	tags?: string[]; // job tags (array overlap)
};

export type JobsStats = {
	today: number;
	in_progress: number;
	awaiting_review: number;
	unscheduled: number;
};

// Redesigned KPI strip — one count per display state. Returned alongside JobsStats from
// /api/jobs/stats (additive). pending/upcoming/today/overdue are the four date-derived faces of a
// stored 'scheduled' job (see deriveJobScheduleState); the rest map 1:1 to stored statuses.
export type JobsStatusCounts = {
	pending: number;
	upcoming: number;
	today: number;
	overdue: number;
	in_progress: number;
	on_hold: number;
	completed: number;
	cancelled: number;
};
