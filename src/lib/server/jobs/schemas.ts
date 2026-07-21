import { z } from 'zod';

const datetimeNullable = z
	.union([z.string(), z.null()])
	.refine((v) => v === null || (typeof v === 'string' && !isNaN(Date.parse(v))), 'Invalid date')
	.transform((v) => (v === null ? null : new Date(v)));

// A single job line item draft. Mirrors the quote line item shape minus the customer-offer-only
// `is_optional` flag — a job is committed work, not a selectable offer.
const jobLineItemBase = z.object({
	description: z.string().trim().min(1, 'Title is required').max(500),
	details: z.string().trim().max(2000).nullable().optional(),
	quantity: z.coerce.number().positive('Quantity must be positive').max(999999),
	unit: z.string().trim().max(50).nullable().optional(),
	section_label: z.string().trim().max(100).nullable().optional(),
	// Stable per-line identity (see job_line_items.line_key). Omitted → DB defaults a fresh one.
	line_key: z.string().uuid().nullable().optional(),
	unit_price: z.coerce.number().min(0, 'Unit price cannot be negative').max(9999999.99),
	unit_cost: z.coerce
		.number()
		.min(0, 'Cost cannot be negative')
		.max(9999999.99)
		.nullable()
		.optional(),
	// Per-line sales-tax flag (mirrors the quote line item). Omitted → true (taxable), matching
	// the DB default and the pre-existing job-wide tax behavior.
	taxable: z.boolean().optional(),
	source_catalog_item_id: z.string().uuid().nullable().optional(),
	position: z.coerce.number().int().min(0).optional()
});

// Shared discount validation (same rules as quotes): a fixed discount needs a positive dollar
// amount; a percent discount needs a value in (0, 100]. 'none'/omitted = no discount.
function validateJobDiscount(
	val: { discount_type?: 'none' | 'fixed' | 'percent'; discount_value?: number | null },
	ctx: z.RefinementCtx
): void {
	if (!val.discount_type || val.discount_type === 'none') return;
	const v = val.discount_value;
	if (v === null || v === undefined || v <= 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['discount_value'],
			message:
				val.discount_type === 'percent'
					? 'Enter a percentage greater than 0'
					: 'Enter a discount amount greater than 0'
		});
		return;
	}
	if (val.discount_type === 'percent' && v > 100) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['discount_value'],
			message: 'Percentage cannot exceed 100'
		});
	}
}

// A single payment-schedule milestone (one-off billing). amount_value is a % of the job total
// when amount_type='percent' (0–100) or a flat dollar amount when 'fixed'. `key` is the stable
// identity that lets a PATCH preserve already-invoiced rows. Over-allocation across rows is
// allowed (the UI shows the remaining balance) — matching Jobber/Housecall Pro.
const paymentMilestoneBase = z
	.object({
		key: z.string().uuid().nullable().optional(),
		description: z.string().trim().min(1, 'Description is required').max(120),
		amount_type: z.enum(['percent', 'fixed']),
		amount_value: z.coerce.number().positive('Amount must be greater than 0').max(9999999.99),
		due_date: z
			.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'), z.null()])
			.optional()
	})
	.superRefine((m, ctx) => {
		if (m.amount_type === 'percent' && m.amount_value > 100) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['amount_value'],
				message: 'Percentage cannot exceed 100'
			});
		}
	});

const paymentMilestonesSchema = z.array(paymentMilestoneBase).max(50).optional();

// Cross-field validation for the unified billing model (Jobber billingType × billingFrequency,
// applied to EVERY job). The only cross-field rule: a 'periodic' frequency needs an invoice
// schedule (invoice_recurrence — Jobber's "Invoice frequency" repeat rule). billing_type/frequency
// are otherwise free choices, exactly like Jobber — a one-off may bill per-visit, etc.
function validateBilling(
	val: {
		billing_frequency?: 'on_completion' | 'per_visit' | 'periodic' | 'never';
		invoice_recurrence?: unknown;
	},
	ctx: z.RefinementCtx
): void {
	if (val.billing_frequency === 'periodic' && !val.invoice_recurrence) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['invoice_recurrence'],
			message: 'Choose an invoice schedule'
		});
	}
}

// Cross-field guard: a one-off job's payment schedule cannot bill MORE than the job total.
// We rebuild the job total from the same inputs recalcJobTotals uses (line items → discount →
// tax), then sum the requested allocation (percent rows = % of the total, fixed rows = a flat $)
// with the same per-row math as milestoneAmount on the client. Only runs when BOTH line_items
// and payment_milestones are in the payload — the job form always sends them together, so an
// over-allocated schedule is rejected; a milestone-only PATCH (no lines, no total to check
// against) is left to the client guard. A 1-cent tolerance absorbs rounding.
function validatePaymentScheduleCap(
	val: {
		line_items?: Array<{ quantity: number; unit_price: number }>;
		discount_type?: 'none' | 'fixed' | 'percent';
		discount_value?: number | null;
		tax_rate?: number;
		payment_milestones?: Array<{ amount_type: 'percent' | 'fixed'; amount_value: number }>;
	},
	ctx: z.RefinementCtx
): void {
	const lines = val.line_items;
	const milestones = val.payment_milestones;
	if (!lines || !milestones || milestones.length === 0) return;

	const subtotal = lines.reduce((sum, li) => {
		const q = Number(li.quantity);
		const p = Number(li.unit_price);
		if (!Number.isFinite(q) || !Number.isFinite(p)) return sum;
		return sum + Math.round(q * p * 100) / 100;
	}, 0);

	let discountAmount = 0;
	if (val.discount_type === 'percent' && val.discount_value)
		discountAmount = Math.round(((subtotal * Math.min(val.discount_value, 100)) / 100) * 100) / 100;
	else if (val.discount_type === 'fixed' && val.discount_value)
		discountAmount = Math.min(Math.max(val.discount_value, 0), subtotal);

	const base = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
	const taxRate = val.tax_rate && val.tax_rate > 0 ? val.tax_rate : 0;
	const taxAmount = Math.round(base * taxRate * 100) / 100;
	const total = Math.round((base + taxAmount) * 100) / 100;

	const allocated = milestones.reduce((sum, m) => {
		if (!Number.isFinite(m.amount_value) || m.amount_value <= 0) return sum;
		return (
			sum +
			(m.amount_type === 'percent'
				? Math.round(total * m.amount_value) / 100
				: Math.round(m.amount_value * 100) / 100)
		);
	}, 0);

	if (Math.round((allocated - total) * 100) / 100 > 0.01) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['payment_milestones'],
			message: 'Payment schedule exceeds the job total'
		});
	}
}

const jobTagsSchema = z.array(z.string().trim().min(1).max(50)).max(20).optional();
// Free-text WORK category ("Repair", "Installation"). Called job_type before 0159 — not to
// be confused with jobTypeSchema below, which is Jobber's one-off/recurring enum.
const jobCategorySchema = z.string().trim().max(100).nullable().optional();
// Jobber `jobType`: the user's One-off/Recurring decision. Required on create (Jobber's
// field is non-null) and rejected on update (the type is immutable — duplicate instead).
const jobTypeSchema = z.enum(['one_off', 'recurring']);

// Unified billing model (Jobber billingType × billingFrequency) on EVERY job.
//   billing_type — WHAT each invoice contains: 'fixed' = the job's line items; 'visit_based' =
//     the billable work on completed/past visits. Server defaults to 'fixed' when omitted.
//   billing_frequency — WHEN to invoice: on_completion / per_visit / periodic / never. Server
//     defaults to 'on_completion'.
//   invoice_frequency — the cadence when billing_frequency='periodic' (weekly/biweekly/monthly);
//     null otherwise. Advisory in v1 (nothing auto-fires). Cross-field rule in validateBilling.
const billingTypeSchema = z.enum(['fixed', 'visit_based']).optional();
const billingFrequencySchema = z
	.enum(['on_completion', 'per_visit', 'periodic', 'never'])
	.optional();
const invoiceFrequencySchema = z.enum(['weekly', 'biweekly', 'monthly']).nullable().optional();

// Recurring-job repeat rule. Mirrors $lib/server/jobs/recurrence JobRecurrence.
// Cross-field shape (week needs weekdays; month needs a mode + its selections;
// end needs its matching fields) is enforced in validateRecurrence below.
export const recurrenceSchema = z.object({
	freq: z.enum(['day', 'week', 'month', 'year']),
	interval: z.coerce.number().int().min(1).max(52),
	weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
	month_mode: z.enum(['day_of_month', 'day_of_week']).optional(),
	month_days: z.array(z.number().int().min(1).max(31)).max(31).optional(),
	month_last_day: z.boolean().optional(),
	// day_of_week grid cells (1st..4th × Sun..Sat) — 28 possible, so max 28.
	month_cells: z
		.array(
			z.object({
				week: z.number().int().min(1).max(4),
				weekday: z.number().int().min(0).max(6)
			})
		)
		.max(28)
		.optional(),
	// Legacy day_of_week shape — still accepted so an untouched rule round-trips through PATCH.
	month_weeks: z.array(z.number().int().min(1).max(4)).max(4).optional(),
	month_weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
	end_type: z.enum(['after', 'on']),
	end_after_count: z.coerce.number().int().min(1).max(999).optional(),
	end_after_unit: z.enum(['days', 'weeks', 'months', 'years']).optional(),
	end_on: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid end date')
		.optional(),
	anytime: z.boolean().optional()
});

export function validateRecurrence(
	rec: z.infer<typeof recurrenceSchema>,
	ctx: z.RefinementCtx
): void {
	// 'day' (every N days) and 'year' (every N years on the anchor's date) need no day/month
	// selection — the interval plus the start date is the whole rule.
	if (rec.freq === 'day' || rec.freq === 'year') {
		// nothing to validate beyond the interval bounds already enforced by the schema.
	} else if (rec.freq === 'week') {
		if (!rec.weekdays || rec.weekdays.length === 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['recurrence', 'weekdays'],
				message: 'Pick at least one weekday'
			});
		}
	} else {
		const mode = rec.month_mode;
		if (!mode) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['recurrence', 'month_mode'],
				message: 'Choose day of month or day of week'
			});
		} else if (mode === 'day_of_month') {
			if ((!rec.month_days || rec.month_days.length === 0) && !rec.month_last_day) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['recurrence', 'month_days'],
					message: 'Pick at least one day of the month'
				});
			}
		} else {
			// The grid needs at least one tapped cell. A legacy rule (weeks + weekdays lists)
			// still satisfies this so an untouched recurring job can round-trip through PATCH.
			const legacy = (rec.month_weeks?.length ?? 0) > 0 && (rec.month_weekdays?.length ?? 0) > 0;
			if ((rec.month_cells?.length ?? 0) === 0 && !legacy) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['recurrence', 'month_cells'],
					message: 'Pick at least one day in the grid'
				});
			}
		}
	}
	if (rec.end_type === 'after') {
		if (rec.end_after_count == null || !rec.end_after_unit) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['recurrence', 'end_after_count'],
				message: 'Set how long the schedule runs'
			});
		}
	} else if (!rec.end_on) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['recurrence', 'end_on'],
			message: 'Set an end date'
		});
	}
}

// The periodic-invoicing recurrence (Jobber "Invoice frequency" → PERIODIC). Reuses the visit
// recurrence field rules MINUS the end condition — a periodic invoice schedule inherits the job's
// window, so it carries no end_type/end_on. Stored in jobs.invoice_recurrence.
export const invoiceRecurrenceSchema = recurrenceSchema.omit({
	end_type: true,
	end_after_count: true,
	end_after_unit: true,
	end_on: true,
	anytime: true
});

// Validate an invoice recurrence's freq/day/month selection — the non-end half of
// validateRecurrence (there is no end condition to check on an invoice schedule).
export function validateInvoiceRecurrence(
	rec: z.infer<typeof invoiceRecurrenceSchema>,
	ctx: z.RefinementCtx
): void {
	if (rec.freq === 'day' || rec.freq === 'year') {
		// interval + the anchor date is the whole rule.
	} else if (rec.freq === 'week') {
		if (!rec.weekdays || rec.weekdays.length === 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['invoice_recurrence', 'weekdays'],
				message: 'Pick at least one weekday'
			});
		}
	} else {
		const mode = rec.month_mode;
		if (!mode) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['invoice_recurrence', 'month_mode'],
				message: 'Choose day of month or day of week'
			});
		} else if (mode === 'day_of_month') {
			if ((!rec.month_days || rec.month_days.length === 0) && !rec.month_last_day) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['invoice_recurrence', 'month_days'],
					message: 'Pick at least one day of the month'
				});
			}
		} else {
			const legacy = (rec.month_weeks?.length ?? 0) > 0 && (rec.month_weekdays?.length ?? 0) > 0;
			if ((rec.month_cells?.length ?? 0) === 0 && !legacy) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['invoice_recurrence', 'month_cells'],
					message: 'Pick at least one day in the grid'
				});
			}
		}
	}
}

export const updateJobSchema = z
	.object({
		assigned_to: z.string().uuid().nullable().optional(),
		scheduled_start: datetimeNullable.optional(),
		scheduled_end: datetimeNullable.optional(),
		notes: z.string().trim().max(5000).nullable().optional(),
		scope_of_work: z.string().trim().max(10000).nullable().optional()
	})
	.refine(
		(d) =>
			!(d.scheduled_start && d.scheduled_end) ||
			d.scheduled_end.getTime() >= d.scheduled_start.getTime(),
		{ message: 'Scheduled end must be after start', path: ['scheduled_end'] }
	);

// Jobber model: a job is open (`active`) or closed (`archived`). The only lifecycle moves are
// closing it — as finished (`complete`) or called off (`cancel`) — and reopening it (`reopen`,
// Jobber's jobReopen). The close REASON is recorded by completed_at / cancelled_at, which drive the
// job.completed / job.cancelled outbox events. The status endpoint enforces which action is legal
// from the current state.
export const transitionStatusSchema = z.object({
	action: z.enum(['complete', 'cancel', 'reopen'])
});

const nullableTrimmed = (max: number) =>
	z
		.union([z.string(), z.null()])
		.optional()
		.transform((v) => (v == null ? null : v.trim() || null))
		.refine((v) => v === null || v.length <= max, `Too long (max ${max})`);

// One custom-field value (S7) = one job's answer to one custom-field definition, addressed by
// the field id. Only the column matching the field's type is honored server-side (routed by the
// loaded field_type); the rest are ignored. Every value accepts null to clear it. Declared here
// so createJobSchema (below) can embed it for the New Job form.
export const jobCustomFieldValueSchema = z.object({
	field_id: z.string().uuid(),
	value_text: z.string().trim().max(2000).nullable().optional(),
	value_number: z.coerce.number().min(-9999999999).max(9999999999).nullable().optional(),
	value_bool: z.boolean().nullable().optional(),
	value_date: z
		.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'), z.null()])
		.optional()
});

export const createJobSchema = z
	.object({
		contact_id: z.string().uuid('Contact is required'),
		opportunity_id: z.string().uuid().nullable().optional(),
		title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
		// Status is not client-settable on create — a new job is always 'scheduled' (shown as
		// "Pending" until a date is added). It advances only via the /status transition endpoint.
		assigned_to: z.string().uuid().nullable().optional(),
		// The One-off/Recurring toggle. Required: the user decides, we never infer it.
		job_type: jobTypeSchema,
		job_category: jobCategorySchema,
		tags: jobTagsSchema,
		scheduled_start: datetimeNullable.optional(),
		scheduled_end: datetimeNullable.optional(),
		// Jobber "Anytime" visit: a one-off job with a DATE but no clock time. When true the created
		// visit is all-day (scheduled_end forced NULL) and lands in the calendar's Anytime lane; the
		// job still carries the date so its status reads Scheduled. Ignored for recurring jobs.
		all_day: z.boolean().optional(),
		// Jobber "Schedule later": create the job with an UNSCHEDULED visit (a placeholder with
		// no date) instead of a dated calendar visit. Only meaningful on a one-off job with no
		// scheduled_start; ignored for recurring jobs (which always expand to dated visits).
		schedule_later: z.boolean().optional(),
		// Jobber "As Needed — We Won't Prompt You": create a recurring job with NO rule and NO
		// visits. Any recurrence sent alongside is ignored; scheduled_start/scheduled_end are
		// STORED as the job's window (start day + end boundary) without creating any visit.
		// The job lands in "Action Required" until the contractor adds a visit.
		schedule_as_needed: z.boolean().optional(),
		scope_of_work: nullableTrimmed(10000),
		notes: nullableTrimmed(5000),
		service_address_line_1: nullableTrimmed(200),
		service_address_line_2: nullableTrimmed(200),
		service_address_city: nullableTrimmed(100),
		service_address_state: nullableTrimmed(100),
		service_address_zip: nullableTrimmed(20),
		// Pricing — same shape/rules as quotes. recalcJobTotals computes the dollar figures
		// from the inserted line items; the client only sends rate/type/value/label + lines.
		tax_rate: z.coerce.number().min(0).max(1).optional(),
		discount_type: z.enum(['none', 'fixed', 'percent']).optional(),
		discount_value: z.coerce.number().min(0).max(9999999.99).nullable().optional(),
		discount_label: z.string().trim().max(60).nullable().optional(),
		// Which channel(s) to confirm the schedule to the client on. The client computes a
		// smart default (both when reachable, else the one channel we have); 'none'/omitted
		// stays silent. Only honored server-side when a scheduled_start actually exists.
		notify_channel: z.enum(['sms', 'email', 'both', 'none']).optional(),
		// Optional per-job overrides for the client confirmation copy. Edited on the form for
		// THIS job only; null/omitted = use the org's job_scheduled template. Lengths mirror the
		// settings limits (sms/subject/body). The worker interpolates merge tokens at send time.
		notify_sms_message: z.string().trim().max(500).nullable().optional(),
		notify_email_subject: z.string().trim().max(200).nullable().optional(),
		notify_email_message: z.string().trim().max(2000).nullable().optional(),
		// Recurring job: the repeat rule + the instruction text copied onto every
		// generated visit. NULL/omitted recurrence = one-off (existing behavior).
		recurrence: recurrenceSchema.nullable().optional(),
		visit_instructions: nullableTrimmed(2000),
		line_items: z.array(jobLineItemBase).max(200).optional(),
		// Billing model (Jobber billingType × billingFrequency), applied to every job. billing_type
		// 'fixed' bills the job's line items via an optional payment schedule (milestones); any
		// frequency + type combo is allowed (validated below).
		billing_type: billingTypeSchema,
		billing_frequency: billingFrequencySchema,
		invoice_frequency: invoiceFrequencySchema,
		// Jobber "Invoice frequency" repeat rule — required when billing_frequency='periodic',
		// null/omitted otherwise (see validateBilling). Independent of the visit `recurrence` above.
		invoice_recurrence: invoiceRecurrenceSchema.nullable().optional(),
		payment_milestones: paymentMilestonesSchema,
		// Custom field values (S7) entered on the New Job form. The required-field gate is
		// enforced server-side against the org's live definitions (Zod can't know them here).
		custom_field_values: z.array(jobCustomFieldValueSchema).max(100).optional()
	})
	.refine(
		(d) =>
			!(d.scheduled_start && d.scheduled_end) ||
			d.scheduled_end.getTime() >= d.scheduled_start.getTime(),
		{ message: 'Scheduled end must be after start', path: ['scheduled_end'] }
	)
	.refine((d) => !d.recurrence || !!d.scheduled_start, {
		message: 'A recurring job needs a start date',
		path: ['scheduled_start']
	})
	.superRefine(validateJobDiscount)
	.superRefine((d, ctx) => {
		if (d.recurrence) validateRecurrence(d.recurrence, ctx);
		if (d.invoice_recurrence) validateInvoiceRecurrence(d.invoice_recurrence, ctx);
		validateBilling(d, ctx);
		validatePaymentScheduleCap(d, ctx);
	});

// Update a job's editable fields + (optionally) replace its line items. Lines are wipe-and-
// reinsert keyed by line_key, then recalcJobTotals runs — same pattern as the quote PATCH.
export const updateJobLineItemsSchema = z
	.object({
		assigned_to: z.string().uuid().nullable().optional(),
		// NOTE: job_type is deliberately absent — the one-off/recurring type is immutable after
		// create (Jobber: "the job type cannot be switched… it would need to be recreated").
		// The route rejects it explicitly rather than silently ignoring it; see +server.ts.
		job_category: jobCategorySchema,
		tags: jobTagsSchema,
		scheduled_start: datetimeNullable.optional(),
		scheduled_end: datetimeNullable.optional(),
		notes: z.string().trim().max(5000).nullable().optional(),
		scope_of_work: z.string().trim().max(10000).nullable().optional(),
		tax_rate: z.coerce.number().min(0).max(1).optional(),
		discount_type: z.enum(['none', 'fixed', 'percent']).optional(),
		discount_value: z.coerce.number().min(0).max(9999999.99).nullable().optional(),
		discount_label: z.string().trim().max(60).nullable().optional(),
		// Reschedule confirmation channel (see createJobSchema). Honored only when the
		// updated job has a scheduled_start; 'none'/omitted = stay silent.
		notify_channel: z.enum(['sms', 'email', 'both', 'none']).optional(),
		line_items: z.array(jobLineItemBase).max(200).optional(),
		// Recurring schedule edit. Sending `recurrence` (a rule or null) makes the PATCH
		// recurrence-aware: the route freezes past/invoiced visits and rebuilds the upcoming
		// ones from this rule. `visit_instructions` is copied onto every newly generated visit
		// (same as create). When a rule is sent, scheduled_start must accompany it (the anchor
		// for expansion) — enforced below.
		// `null` clears the RULE only; it does NOT convert the job to one-off (job_type is
		// immutable since 0159). A recurring job with no rule is exactly Jobber's "as needed".
		recurrence: recurrenceSchema.nullable().optional(),
		// Switch a job to/from Jobber "As needed" on edit. When true the recurrence-aware PATCH
		// clears future open visits and leaves the job with none (Action Required); when false it
		// resumes normal one-off/recurring behavior. Omitted = leave the flag untouched.
		schedule_as_needed: z.boolean().optional(),
		visit_instructions: nullableTrimmed(2000),
		// Billing model (Jobber billingType × billingFrequency). Editable on any job. The payment
		// schedule is wipe-and-reinserted by `key`, except rows already turned into invoices (those
		// are locked server-side).
		billing_type: billingTypeSchema,
		billing_frequency: billingFrequencySchema,
		invoice_frequency: invoiceFrequencySchema,
		// Jobber "Invoice frequency" repeat rule (see createJobSchema). Cleared server-side when
		// billing_frequency ≠ 'periodic'.
		invoice_recurrence: invoiceRecurrenceSchema.nullable().optional(),
		payment_milestones: paymentMilestonesSchema
	})
	.refine(
		(d) =>
			!(d.scheduled_start && d.scheduled_end) ||
			d.scheduled_end.getTime() >= d.scheduled_start.getTime(),
		{ message: 'Scheduled end must be after start', path: ['scheduled_end'] }
	)
	.refine((d) => !d.recurrence || !!d.scheduled_start, {
		message: 'A recurring job needs a start date',
		path: ['scheduled_start']
	})
	.superRefine(validateJobDiscount)
	.superRefine((d, ctx) => {
		if (d.recurrence) validateRecurrence(d.recurrence, ctx);
		if (d.invoice_recurrence) validateInvoiceRecurrence(d.invoice_recurrence, ctx);
		validateBilling(d, ctx);
		validatePaymentScheduleCap(d, ctx);
	});

// ── Job costing expenses (Session 1) ────────────────────────────────────────
// An out-of-pocket cost logged against a job (materials receipt, subcontractor, equipment, or
// hand-entered labor until timesheets land). amount is always > 0 (a cost, never a credit);
// expense_date is the calendar day the cost was incurred. Cost data is private — the routes gate
// on can_view_revenue on top of this input validation.
export const jobExpenseCategoryValues = [
	'materials',
	'labor',
	'subcontractor',
	'equipment',
	'other'
] as const;

export const createJobExpenseSchema = z.object({
	category: z.enum(jobExpenseCategoryValues),
	description: z
		.string()
		.trim()
		.min(1, 'Description is required')
		.max(200, 'Description is too long'),
	amount: z.coerce.number().positive('Amount must be greater than 0').max(9999999.99),
	expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
	notes: z.string().trim().max(2000).nullable().optional()
});

export const updateJobExpenseSchema = z
	.object({
		category: z.enum(jobExpenseCategoryValues).optional(),
		description: z.string().trim().min(1, 'Description is required').max(200).optional(),
		amount: z.coerce.number().positive('Amount must be greater than 0').max(9999999.99).optional(),
		expense_date: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
			.optional(),
		notes: z.string().trim().max(2000).nullable().optional()
	})
	.refine((d) => Object.values(d).some((v) => v !== undefined), 'No changes to save');

export type CreateJobExpenseInput = z.infer<typeof createJobExpenseSchema>;
export type UpdateJobExpenseInput = z.infer<typeof updateJobExpenseSchema>;

// ── Time tracking (Session 2) ───────────────────────────────────────────────
// Two shapes through one endpoint: start a live timer (clock_out omitted, clock_in defaults to
// now server-side) or log a manual completed entry (clock_in + clock_out both given). Route
// enforces clock_out > clock_in and, for non-managers, org_member_id === self.
export const createJobTimeEntrySchema = z
	.object({
		org_member_id: z.string().uuid().optional(),
		clock_in: z.string().datetime().optional(),
		clock_out: z.string().datetime().optional(),
		notes: z.string().trim().max(2000).nullable().optional()
	})
	.refine((d) => !d.clock_out || d.clock_in, {
		message: 'A manual entry needs a start time',
		path: ['clock_in']
	})
	.refine((d) => !d.clock_in || !d.clock_out || new Date(d.clock_out) > new Date(d.clock_in), {
		message: 'End time must be after start time',
		path: ['clock_out']
	});

export const updateJobTimeEntrySchema = z
	.object({
		clock_in: z.string().datetime().optional(),
		// Explicit null is not accepted — a completed entry can't be reopened into a running
		// timer through this route; delete and re-log instead.
		clock_out: z.string().datetime().optional(),
		notes: z.string().trim().max(2000).nullable().optional()
	})
	.refine((d) => Object.values(d).some((v) => v !== undefined), 'No changes to save');

export type CreateJobTimeEntryInput = z.infer<typeof createJobTimeEntrySchema>;
export type UpdateJobTimeEntryInput = z.infer<typeof updateJobTimeEntrySchema>;

// ── Tasks / checklist (Session 3) ───────────────────────────────────────────
// A checklist task on a job (Jobber "Tasks"). Only the title is required; assignee/due date are
// optional. `position` orders the list (the client sends the desired slot). A new task is never
// created already-completed — it's ticked afterward via PATCH.
export const createJobTaskSchema = z.object({
	title: z.string().trim().min(1, 'Task is required').max(300, 'Task is too long'),
	assigned_to: z.string().uuid().nullable().optional(),
	due_date: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'), z.null()]).optional(),
	position: z.coerce.number().min(0).max(1000000).optional()
});

export const updateJobTaskSchema = z
	.object({
		title: z.string().trim().min(1, 'Task is required').max(300).optional(),
		completed: z.boolean().optional(),
		assigned_to: z.string().uuid().nullable().optional(),
		due_date: z
			.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'), z.null()])
			.optional(),
		position: z.coerce.number().min(0).max(1000000).optional()
	})
	.refine((d) => Object.values(d).some((v) => v !== undefined), 'No changes to save');

export type CreateJobTaskInput = z.infer<typeof createJobTaskSchema>;
export type UpdateJobTaskInput = z.infer<typeof updateJobTaskSchema>;

export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type UpdateJobLineItemsInput = z.infer<typeof updateJobLineItemsSchema>;
export type TransitionStatusInput = z.infer<typeof transitionStatusSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;

// ── Job form templates (Session 4.1) ────────────────────────────────────────
// A reusable inspection/checklist form: a name + description and an ordered set of
// fields. `id` on a field is present when editing an existing field (PATCH upserts by
// id); omitted for a brand-new field. A dropdown field must carry at least one non-empty
// option. The template must have at least one field.
export const JOB_FORM_FIELD_TYPES = [
	'section',
	'short_text',
	'long_text',
	'number',
	'checkbox',
	'dropdown',
	'date',
	'photo',
	'signature'
] as const;

const jobFormFieldSchema = z
	.object({
		id: z.string().uuid().optional(),
		field_type: z.enum(JOB_FORM_FIELD_TYPES),
		label: z.string().trim().min(1, 'Label is required').max(200, 'Label is too long'),
		help_text: z.string().trim().max(500, 'Help text is too long').nullable().optional(),
		required: z.boolean().optional(),
		// Only meaningful for dropdown fields; trimmed, empties dropped downstream.
		options: z.array(z.string().trim().max(120)).max(50).nullable().optional(),
		position: z.coerce.number().min(0).max(1000000).optional()
	})
	.superRefine((f, ctx) => {
		if (f.field_type === 'dropdown') {
			const opts = (f.options ?? []).filter((o) => o.trim().length > 0);
			if (opts.length < 1) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['options'],
					message: 'Add at least one dropdown option'
				});
			}
		}
	});

export const createJobFormTemplateSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
	description: z.string().trim().max(500, 'Description is too long').nullable().optional(),
	fields: z.array(jobFormFieldSchema).min(1, 'Add at least one field').max(100)
});

// Editing replaces the whole template in one call (name/description + full field set).
export const updateJobFormTemplateSchema = createJobFormTemplateSchema;

export type JobFormFieldInput = z.infer<typeof jobFormFieldSchema>;
export type CreateJobFormTemplateInput = z.infer<typeof createJobFormTemplateSchema>;

// ── Job form submissions (Session 4.2) ──────────────────────────────────────
// Attaching a form to a job: only the source template id. The route snapshot-copies the
// template's current fields into the submission, so nothing else is client-settable.
export const attachJobFormSchema = z.object({
	template_id: z.string().uuid('Pick a form to add')
});

// One answer for one snapshotted field, addressed by its submission-field id. Only the column
// matching the field's type is honored server-side; the others are ignored. Every value accepts
// null to clear an answer. value_number is coerced from the input; value_date is a calendar day.
const jobFormAnswerSchema = z.object({
	field_id: z.string().uuid(),
	value_text: z.string().trim().max(5000).nullable().optional(),
	value_number: z.coerce.number().min(-9999999999).max(9999999999).nullable().optional(),
	value_bool: z.boolean().nullable().optional(),
	value_date: z
		.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'), z.null()])
		.optional()
});

// Save answers and/or move the form's status. Both parts optional so the UI can autosave answers
// without touching status, or flip status without resending every answer. When status flips to
// 'completed' the PATCH route enforces the required-field gate (photo/signature checked via media).
export const saveJobFormSubmissionSchema = z
	.object({
		answers: z.array(jobFormAnswerSchema).max(200).optional(),
		status: z.enum(['in_progress', 'completed']).optional()
	})
	.refine((d) => d.answers !== undefined || d.status !== undefined, 'No changes to save');

export type AttachJobFormInput = z.infer<typeof attachJobFormSchema>;
export type SaveJobFormSubmissionInput = z.infer<typeof saveJobFormSubmissionSchema>;

// ── Client sign-off (Session 6) ─────────────────────────────────────────────
// The signer's typed name, saved alongside the drawn signature image (uploaded
// separately via /api/media/upload). Saving stamps signed_at server-side.
export const saveJobSignoffSchema = z.object({
	signer_name: z.string().trim().min(1, 'A name is required').max(120, 'Name is too long')
});

export type SaveJobSignoffInput = z.infer<typeof saveJobSignoffSchema>;

// ── Custom fields (Session 7) ────────────────────────────────────────────────
// Org-defined extra fields on a job (Jobber "Custom Fields"). Definitions are managed
// one-at-a-time in Settings (unlike job form templates, which replace the whole set),
// so there's a create + partial-update shape. `field_type` is immutable after creation
// (changing it would strand already-entered values of the old type) — the update schema
// omits it. A dropdown definition must carry at least one non-empty option.
export const JOB_CUSTOM_FIELD_TYPES = [
	'short_text',
	'number',
	'date',
	'dropdown',
	'checkbox',
	'link'
] as const;

export const createJobCustomFieldSchema = z
	.object({
		field_type: z.enum(JOB_CUSTOM_FIELD_TYPES),
		label: z.string().trim().min(1, 'Label is required').max(120, 'Label is too long'),
		help_text: z.string().trim().max(500, 'Help text is too long').nullable().optional(),
		required: z.boolean().optional(),
		// Only meaningful for dropdown; trimmed + empties dropped downstream.
		options: z.array(z.string().trim().max(120)).max(50).nullable().optional(),
		position: z.coerce.number().min(0).max(1000000).optional()
	})
	.superRefine((f, ctx) => {
		if (f.field_type === 'dropdown') {
			const opts = (f.options ?? []).filter((o) => o.trim().length > 0);
			if (opts.length < 1) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['options'],
					message: 'Add at least one dropdown option'
				});
			}
		}
	});

export const updateJobCustomFieldSchema = z
	.object({
		label: z.string().trim().min(1, 'Label is required').max(120).optional(),
		help_text: z.string().trim().max(500).nullable().optional(),
		required: z.boolean().optional(),
		options: z.array(z.string().trim().max(120)).max(50).nullable().optional(),
		position: z.coerce.number().min(0).max(1000000).optional()
	})
	.refine((d) => Object.values(d).some((v) => v !== undefined), 'No changes to save');

export const saveJobCustomFieldValuesSchema = z.object({
	values: z.array(jobCustomFieldValueSchema).max(100)
});

export type CreateJobCustomFieldInput = z.infer<typeof createJobCustomFieldSchema>;
export type UpdateJobCustomFieldInput = z.infer<typeof updateJobCustomFieldSchema>;
export type JobCustomFieldValueInput = z.infer<typeof jobCustomFieldValueSchema>;
export type SaveJobCustomFieldValuesInput = z.infer<typeof saveJobCustomFieldValuesSchema>;
