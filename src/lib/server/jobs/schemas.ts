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

const jobTagsSchema = z.array(z.string().trim().min(1).max(50)).max(20).optional();
const jobTypeSchema = z.string().trim().max(100).nullable().optional();

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

export const transitionStatusSchema = z.object({
	status: z.enum(['in_progress', 'completed', 'cancelled'])
});

const nullableTrimmed = (max: number) =>
	z
		.union([z.string(), z.null()])
		.optional()
		.transform((v) => (v == null ? null : v.trim() || null))
		.refine((v) => v === null || v.length <= max, `Too long (max ${max})`);

export const createJobSchema = z
	.object({
		contact_id: z.string().uuid('Contact is required'),
		opportunity_id: z.string().uuid().nullable().optional(),
		title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
		status: z.enum(['scheduled', 'in_progress', 'completed']).optional().default('scheduled'),
		assigned_to: z.string().uuid().nullable().optional(),
		job_type: jobTypeSchema,
		tags: jobTagsSchema,
		scheduled_start: datetimeNullable.optional(),
		scheduled_end: datetimeNullable.optional(),
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
		line_items: z.array(jobLineItemBase).max(200).optional()
	})
	.refine(
		(d) =>
			!(d.scheduled_start && d.scheduled_end) ||
			d.scheduled_end.getTime() >= d.scheduled_start.getTime(),
		{ message: 'Scheduled end must be after start', path: ['scheduled_end'] }
	)
	.superRefine(validateJobDiscount);

// Update a job's editable fields + (optionally) replace its line items. Lines are wipe-and-
// reinsert keyed by line_key, then recalcJobTotals runs — same pattern as the quote PATCH.
export const updateJobLineItemsSchema = z
	.object({
		assigned_to: z.string().uuid().nullable().optional(),
		job_type: jobTypeSchema,
		tags: jobTagsSchema,
		scheduled_start: datetimeNullable.optional(),
		scheduled_end: datetimeNullable.optional(),
		notes: z.string().trim().max(5000).nullable().optional(),
		scope_of_work: z.string().trim().max(10000).nullable().optional(),
		tax_rate: z.coerce.number().min(0).max(1).optional(),
		discount_type: z.enum(['none', 'fixed', 'percent']).optional(),
		discount_value: z.coerce.number().min(0).max(9999999.99).nullable().optional(),
		discount_label: z.string().trim().max(60).nullable().optional(),
		line_items: z.array(jobLineItemBase).max(200).optional()
	})
	.refine(
		(d) =>
			!(d.scheduled_start && d.scheduled_end) ||
			d.scheduled_end.getTime() >= d.scheduled_start.getTime(),
		{ message: 'Scheduled end must be after start', path: ['scheduled_end'] }
	)
	.superRefine(validateJobDiscount);

export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type UpdateJobLineItemsInput = z.infer<typeof updateJobLineItemsSchema>;
export type TransitionStatusInput = z.infer<typeof transitionStatusSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
