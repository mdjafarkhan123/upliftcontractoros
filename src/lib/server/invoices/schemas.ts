import { z } from 'zod';

// Shared discount validation for the invoice PATCH (mirrors quotes/schemas.ts validateDiscount).
// A fixed discount needs a positive dollar amount; a percent discount needs a value in (0, 100].
// The server clamps a fixed discount to the subtotal, so only the lower bound is guarded here.
// 'none'/omitted = no discount.
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

const lineItemBase = z.object({
	description: z.string().trim().min(1, 'Description is required').max(500),
	quantity: z.coerce.number().positive('Quantity must be positive').max(999999),
	// Optional unit of measure label (mirrors quote_line_items.unit). Display-only.
	unit: z.string().trim().max(50).nullable().optional(),
	unit_price: z.coerce.number().min(0, 'Unit price cannot be negative').max(9999999.99),
	// Per-line sales-tax flag. Only taxable lines feed the invoice's tax base. Defaults
	// true (taxable) when omitted.
	taxable: z.boolean().optional(),
	// Snapshot of cost-to-business captured when added from catalog. Feeds the internal
	// cost/margin panel only — never shown to the customer.
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

export const createInvoiceSchema = z.object({
	contact_id: z.string().uuid('Contact is required'),
	job_id: z.string().uuid().nullable().optional(),
	opportunity_id: z.string().uuid().nullable().optional(),
	quote_id: z.string().uuid().nullable().optional(),
	title: z.string().trim().min(1, 'Title is required').max(200),
	tax_rate: z.coerce.number().min(0).max(1).optional(),
	due_date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
		.nullable()
		.optional(),
	notes: z.string().trim().max(5000).nullable().optional(),
	// Customer-facing Terms & Conditions. On create, omitted → server snapshots the org
	// default; an explicit value overrides; null clears it. Mirrors quotes.
	terms: z.string().trim().max(8000).nullable().optional(),
	// Per-invoice automatic-reminders opt-in. Omitted → true (follows the org schedule).
	// Uncheck to skip reminders for this specific invoice.
	send_payment_reminders: z.boolean().optional(),
	// Per-invoice accept-tips opt-in. Omitted → true (accepts tips when the org has tips on).
	// Uncheck to suppress the tip selector for this specific invoice.
	accept_tips: z.boolean().optional(),
	// Per-invoice late-fee terms (M8 Phase 2). Omitted → server snapshots the org's active late-fee
	// config onto the invoice. Pass to override for this invoice (e.g. late_fee_enabled=false to
	// waive it for one client). Sent as a consistent triple by the New Invoice page.
	late_fee_enabled: z.boolean().optional(),
	late_fee_type: z.enum(['flat', 'percent']).optional(),
	late_fee_value: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
	line_items: z.array(lineItemBase).max(200).optional()
});

export const updateInvoiceSchema = z
	.object({
		title: z.string().trim().min(1).max(200).optional(),
		tax_rate: z.coerce.number().min(0).max(1).optional(),
		// Invoice-level discount applied before tax (mirrors quotes). 'none' clears it.
		discount_type: z.enum(['none', 'fixed', 'percent']).optional(),
		discount_value: z.coerce.number().min(0).max(9999999.99).nullable().optional(),
		discount_label: z.string().trim().max(60).nullable().optional(),
		due_date: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.nullable()
			.optional(),
		notes: z.string().trim().max(5000).nullable().optional(),
		// Customer-facing Terms & Conditions for this invoice. Null clears it.
		terms: z.string().trim().max(8000).nullable().optional(),
		line_items: z.array(lineItemBase).max(200).optional()
	})
	.superRefine((val, ctx) => {
		validateDiscount(val, ctx);
	});

export const recordPaymentSchema = z.object({
	amount: z.coerce.number().positive('Amount must be greater than zero').max(9999999.99),
	payment_method: z.enum(['cash', 'check', 'bank_transfer', 'other']),
	paid_at: z.string().datetime().optional(),
	notes: z.string().trim().max(500).nullable().optional(),
	// Optional tip (M7) logged alongside a manual cash/check payment. EXTRA money on top of the
	// balance — never validated against amount_due (that check applies to `amount` only). 0/omitted
	// = no tip. Only accepted when the org enabled tips (route re-checks org.tips_enabled).
	tip_amount: z.coerce.number().min(0).max(9999999.99).optional()
});

// Send / re-send an invoice. The contractor picks the delivery channel(s) and may
// override the default message copy. Bodies carry merge tokens ({contact_name},
// {org_name}, {invoice_number}, {invoice_amount}, {invoice_link}) that the worker
// interpolates at delivery time. Null/omitted body = use the built-in default.
// Channel availability (email present, not SMS-opted-out) is enforced in the route.
// Unlike quotes, invoices have no versioning, so there is no `revision` flag — a
// re-send re-delivers the same invoice on the chosen channels.
export const sendInvoiceSchema = z.object({
	channels: z
		.array(z.enum(['email', 'sms']))
		.min(1, 'Choose at least one channel')
		.max(2)
		.transform((arr) => Array.from(new Set(arr))),
	sms_body: z.string().trim().max(640).nullable().optional(),
	email_subject: z.string().trim().max(200).nullable().optional(),
	email_body: z.string().trim().max(5000).nullable().optional()
});

export type SendInvoiceInput = z.infer<typeof sendInvoiceSchema>;

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
