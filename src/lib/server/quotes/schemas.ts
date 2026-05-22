import { z } from 'zod';

const lineItemBase = z.object({
	description: z.string().trim().min(1, 'Description is required').max(500),
	quantity: z.coerce.number().positive('Quantity must be positive').max(999999),
	unit_price: z.coerce.number().min(0, 'Unit price cannot be negative').max(9999999.99),
	position: z.coerce.number().int().min(0).optional()
});

export const createQuoteSchema = z
	.object({
		contact_id: z.string().uuid('Contact is required'),
		opportunity_id: z.string().uuid().nullable().optional(),
		title: z.string().trim().min(1, 'Title is required').max(200),
		tax_rate: z.coerce.number().min(0).max(1).optional(),
		deposit_required: z.boolean().optional(),
		deposit_amount: z.coerce.number().min(0).nullable().optional(),
		notes: z.string().trim().max(5000).nullable().optional(),
		internal_notes: z.string().trim().max(5000).nullable().optional(),
		line_items: z.array(lineItemBase).max(200).optional()
	})
	.superRefine((val, ctx) => {
		if (val.deposit_required) {
			if (val.deposit_amount === null || val.deposit_amount === undefined || val.deposit_amount <= 0) {
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
		tax_rate: z.coerce.number().min(0).max(1).optional(),
		deposit_required: z.boolean().optional(),
		deposit_amount: z.coerce.number().min(0).nullable().optional(),
		notes: z.string().trim().max(5000).nullable().optional(),
		internal_notes: z.string().trim().max(5000).nullable().optional(),
		line_items: z.array(lineItemBase).max(200).optional()
	})
	.superRefine((val, ctx) => {
		if (val.deposit_required === true) {
			if (val.deposit_amount === null || val.deposit_amount === undefined || val.deposit_amount <= 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['deposit_amount'],
					message: 'Deposit amount is required when deposit is enabled'
				});
			}
		}
	});

export const createLineItemSchema = lineItemBase;
export const updateLineItemSchema = lineItemBase.partial();

export const listQuotesQuerySchema = z.object({
	status: z.enum(['all', 'active', 'closed', 'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired']).default('all'),
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

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type CreateLineItemInput = z.infer<typeof createLineItemSchema>;
export type UpdateLineItemInput = z.infer<typeof updateLineItemSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
