import { z } from 'zod';

const lineItemBase = z.object({
	description: z.string().trim().min(1, 'Description is required').max(500),
	quantity: z.coerce.number().positive('Quantity must be positive').max(999999),
	unit_price: z.coerce.number().min(0, 'Unit price cannot be negative').max(9999999.99),
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
	line_items: z.array(lineItemBase).max(200).optional()
});

export const updateInvoiceSchema = z.object({
	title: z.string().trim().min(1).max(200).optional(),
	tax_rate: z.coerce.number().min(0).max(1).optional(),
	due_date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.nullable()
		.optional(),
	notes: z.string().trim().max(5000).nullable().optional(),
	line_items: z.array(lineItemBase).max(200).optional()
});

export const recordPaymentSchema = z.object({
	amount: z.coerce.number().positive('Amount must be greater than zero').max(9999999.99),
	payment_method: z.enum(['cash', 'check', 'bank_transfer', 'other']),
	paid_at: z.string().datetime().optional(),
	notes: z.string().trim().max(500).nullable().optional()
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
