import { z } from 'zod';

const moneyString = z
	.union([z.string(), z.number()])
	.transform((v) => (typeof v === 'number' ? v.toString() : v.trim()))
	.refine((v) => v === '' || /^\d+(\.\d{1,2})?$/.test(v), 'Value must be a positive number')
	.transform((v) => (v === '' ? null : v));

export const createOpportunitySchema = z.object({
	contact_id: z.string().uuid('Invalid contact'),
	title: z.string().trim().min(1, 'Title is required').max(200),
	value: moneyString.optional().nullable(),
	stage_id: z.string().uuid().optional(),
	assigned_to: z.string().uuid().optional().nullable()
});

export const updateOpportunitySchema = z.object({
	title: z.string().trim().min(1).max(200).optional(),
	value: moneyString.optional().nullable(),
	assigned_to: z.string().uuid().nullable().optional()
});

export const moveStageSchema = z.object({
	stage_id: z.string().uuid('Invalid stage'),
	lost_reason: z.string().trim().min(1).max(500).optional()
});

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
export type MoveStageInput = z.infer<typeof moveStageSchema>;
