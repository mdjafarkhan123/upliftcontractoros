import { z } from 'zod';

const datetimeOptional = z
	.string()
	.refine((v) => !isNaN(Date.parse(v)), 'Invalid date')
	.transform((v) => new Date(v))
	.nullable()
	.optional();

// Plain request line item (no optional/markup/package flags — quote-only concepts).
// The line's `total` is NEVER accepted from the client: the route computes
// quantity × unit_price server-side.
export const requestLineItemSchema = z.object({
	// Stable identity across the PATCH wipe-and-reinsert; a fresh line may omit it.
	line_key: z.string().uuid().optional(),
	description: z.string().trim().min(1, 'Item name is required').max(200),
	details: z.string().trim().max(2000).nullable().optional(),
	quantity: z.number().positive('Quantity must be positive').max(99_999_999),
	unit: z.string().trim().max(50).nullable().optional(),
	unit_price: z.number().min(0, 'Price cannot be negative').max(9_999_999_999),
	unit_cost: z.number().min(0, 'Cost cannot be negative').max(9_999_999_999).nullable().optional(),
	taxable: z.boolean().optional().default(true),
	source_catalog_item_id: z.string().uuid().nullable().optional()
});

export const createRequestSchema = z.object({
	contact_id: z.string().uuid(),
	title: z.string().trim().min(1, 'Title is required').max(200),
	service_details: z.string().trim().max(10_000).nullable().optional(),
	lead_source_answer: z.string().trim().max(500).nullable().optional(),
	notes: z.string().trim().max(5000).nullable().optional(),
	// "Requested on" — defaults to now at the DB layer when omitted.
	requested_at: datetimeOptional,
	line_items: z.array(requestLineItemSchema).max(100).optional()
});

// contact_id is immutable in R1 (a request belongs to the client who asked).
// `line_items` present ⇒ full wipe-and-reinsert of the Product/Service block;
// omitted ⇒ lines untouched.
export const updateRequestSchema = z.object({
	title: z.string().trim().min(1, 'Title is required').max(200).optional(),
	service_details: z.string().trim().max(10_000).nullable().optional(),
	lead_source_answer: z.string().trim().max(500).nullable().optional(),
	notes: z.string().trim().max(5000).nullable().optional(),
	requested_at: datetimeOptional,
	line_items: z.array(requestLineItemSchema).max(100).optional()
});

export type RequestLineItemInput = z.infer<typeof requestLineItemSchema>;
export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;
