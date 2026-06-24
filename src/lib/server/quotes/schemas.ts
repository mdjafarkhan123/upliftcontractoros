import { z } from 'zod';

const lineItemBase = z.object({
	// The line title (short name). Required.
	description: z.string().trim().min(1, 'Title is required').max(500),
	// Optional longer description shown under the title. Display-only.
	details: z.string().trim().max(2000).nullable().optional(),
	quantity: z.coerce.number().positive('Quantity must be positive').max(999999),
	unit: z.string().trim().max(50).nullable().optional(),
	// Optional grouping heading. Display/organization only — never affects totals.
	section_label: z.string().trim().max(100).nullable().optional(),
	// Optional add-on line the customer can choose before accepting. Excluded from the
	// quote's base total. Defaults false (a normal required line) when omitted.
	is_optional: z.boolean().optional(),
	// Stable per-line identity (see quote_line_items.line_key). Carried through so per-line
	// photos stay bound across the save's wipe-and-reinsert. Omitted → DB defaults a fresh one.
	line_key: z.string().uuid().nullable().optional(),
	unit_price: z.coerce.number().min(0, 'Unit price cannot be negative').max(9999999.99),
	// Snapshot of cost-to-business captured when added from catalog. Display-never for now.
	unit_cost: z.coerce
		.number()
		.min(0, 'Cost cannot be negative')
		.max(9999999.99)
		.nullable()
		.optional(),
	// Analytics-only soft link back to the catalog item this line came from.
	source_catalog_item_id: z.string().uuid().nullable().optional(),
	position: z.coerce.number().int().min(0).optional()
});

// Shared discount validation for create + update. A fixed discount needs a positive dollar
// amount; a percent discount needs a value in (0, 100]. (The server clamps a fixed discount
// to the subtotal, so we only guard the lower bound here.) 'none'/omitted = no discount.
function validateDiscount(
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

export const createQuoteSchema = z
	.object({
		contact_id: z.string().uuid('Contact is required'),
		opportunity_id: z.string().uuid().nullable().optional(),
		// Job site for this quote — must be one of the contact's saved addresses (validated
		// against the contact in the route). Null = no specific service address.
		service_address_id: z.string().uuid().nullable().optional(),
		title: z.string().trim().min(1, 'Title is required').max(200),
		tax_rate: z.coerce.number().min(0).max(1).optional(),
		discount_type: z.enum(['none', 'fixed', 'percent']).optional(),
		discount_value: z.coerce.number().min(0).max(9999999.99).nullable().optional(),
		discount_label: z.string().trim().max(60).nullable().optional(),
		expires_at: z.coerce.date().nullable().optional(),
		deposit_required: z.boolean().optional(),
		deposit_type: z.enum(['fixed', 'percent']).optional(),
		deposit_amount: z.coerce.number().min(0).nullable().optional(),
		deposit_percent: z.coerce.number().min(0.01).max(99.99).nullable().optional(),
		notes: z.string().trim().max(5000).nullable().optional(),
		internal_notes: z.string().trim().max(5000).nullable().optional(),
		line_items: z.array(lineItemBase).max(200).optional()
	})
	.superRefine((val, ctx) => {
		validateDiscount(val, ctx);
		if (!val.deposit_required) return;
		if ((val.deposit_type ?? 'fixed') === 'percent') {
			if (!val.deposit_percent || val.deposit_percent <= 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['deposit_percent'],
					message: 'Enter a percentage between 0.01 and 99.99'
				});
			}
		} else {
			if (
				val.deposit_amount === null ||
				val.deposit_amount === undefined ||
				val.deposit_amount <= 0
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['deposit_amount'],
					message: 'Deposit amount is required when deposit is enabled'
				});
			}
		}
	});

export const updateQuoteSchema = z
	.object({
		title: z.string().trim().min(1).max(200).optional(),
		// Job site — must be one of the contact's saved addresses (validated in the route).
		service_address_id: z.string().uuid().nullable().optional(),
		tax_rate: z.coerce.number().min(0).max(1).optional(),
		discount_type: z.enum(['none', 'fixed', 'percent']).optional(),
		discount_value: z.coerce.number().min(0).max(9999999.99).nullable().optional(),
		discount_label: z.string().trim().max(60).nullable().optional(),
		expires_at: z.coerce.date().nullable().optional(),
		deposit_required: z.boolean().optional(),
		deposit_type: z.enum(['fixed', 'percent']).optional(),
		deposit_amount: z.coerce.number().min(0).nullable().optional(),
		deposit_percent: z.coerce.number().min(0.01).max(99.99).nullable().optional(),
		notes: z.string().trim().max(5000).nullable().optional(),
		internal_notes: z.string().trim().max(5000).nullable().optional(),
		line_items: z.array(lineItemBase).max(200).optional()
	})
	.superRefine((val, ctx) => {
		validateDiscount(val, ctx);
		if (val.deposit_required !== true) return;
		if ((val.deposit_type ?? 'fixed') === 'percent') {
			if (!val.deposit_percent || val.deposit_percent <= 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['deposit_percent'],
					message: 'Enter a percentage between 0.01 and 99.99'
				});
			}
		} else {
			if (
				val.deposit_amount === null ||
				val.deposit_amount === undefined ||
				val.deposit_amount <= 0
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['deposit_amount'],
					message: 'Deposit amount is required when deposit is enabled'
				});
			}
		}
	});

// Send / resend a quote. The contractor picks the delivery channel(s) and may
// override the default message copy. Bodies carry merge tokens ({contact_name},
// {org_name}, {quote_number}, {quote_amount}, {quote_link}) that the worker
// interpolates at delivery time. Null/omitted body = use the built-in default.
// Channel availability (email present, not SMS-opted-out) is enforced in the route.
export const sendQuoteSchema = z.object({
	channels: z
		.array(z.enum(['email', 'sms']))
		.min(1, 'Choose at least one channel')
		.max(2)
		.transform((arr) => Array.from(new Set(arr))),
	sms_body: z.string().trim().max(640).nullable().optional(),
	email_subject: z.string().trim().max(200).nullable().optional(),
	email_body: z.string().trim().max(5000).nullable().optional()
});

export type SendQuoteInput = z.infer<typeof sendQuoteSchema>;

export const createLineItemSchema = lineItemBase;
export const updateLineItemSchema = lineItemBase.partial();

export const listQuotesQuerySchema = z.object({
	status: z
		.enum(['all', 'active', 'closed', 'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'])
		.default('all'),
	cursor: z.string().nullable().optional()
});

export const createTemplateSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(200),
	description: z.string().trim().max(1000).nullable().optional(),
	line_items: z.array(lineItemBase).max(200).optional()
});

export const updateTemplateSchema = z.object({
	name: z.string().trim().min(1).max(200).optional(),
	description: z.string().trim().max(1000).nullable().optional(),
	line_items: z.array(lineItemBase).max(200).optional()
});

// ── Product / Service Catalog ──────────────────────────────────────────────
const catalogItemBase = {
	name: z.string().trim().min(1, 'Name is required').max(200),
	description: z.string().trim().max(1000).nullable().optional(),
	unit_price: z.coerce.number().min(0, 'Price cannot be negative').max(9999999.99),
	unit: z.string().trim().max(50).nullable().optional(),
	unit_cost: z.coerce
		.number()
		.min(0, 'Cost cannot be negative')
		.max(9999999.99)
		.nullable()
		.optional(),
	category: z.string().trim().max(100).nullable().optional(),
	image_url: z.string().max(500).nullable().optional()
};

export const createCatalogItemSchema = z.object({
	...catalogItemBase,
	// When false/absent the API rejects a name that already exists (409) so the UI can
	// offer "update existing vs save as new". Set true to deliberately create a duplicate.
	force: z.boolean().optional()
});

export const updateCatalogItemSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(200).optional(),
	description: z.string().trim().max(1000).nullable().optional(),
	unit_price: z.coerce.number().min(0, 'Price cannot be negative').max(9999999.99).optional(),
	unit: z.string().trim().max(50).nullable().optional(),
	unit_cost: z.coerce
		.number()
		.min(0, 'Cost cannot be negative')
		.max(9999999.99)
		.nullable()
		.optional(),
	category: z.string().trim().max(100).nullable().optional(),
	image_url: z.string().max(500).nullable().optional()
});

export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type CreateLineItemInput = z.infer<typeof createLineItemSchema>;
export type UpdateLineItemInput = z.infer<typeof updateLineItemSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
