import { z } from 'zod';

const moneyString = z
	.union([z.string(), z.number()])
	.transform((v) => (typeof v === 'number' ? v.toString() : v.trim()))
	.refine((v) => v === '' || /^\d+(\.\d{1,2})?$/.test(v), 'Value must be a positive number')
	.transform((v) => (v === '' ? null : v));

const isoDate = z
	.string()
	.trim()
	.refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), 'Expected close date must be YYYY-MM-DD');

export const createOpportunitySchema = z.object({
	contact_id: z.string().uuid('Invalid contact'),
	title: z.string().trim().min(1, 'Title is required').max(200),
	value: moneyString.optional().nullable(),
	stage_id: z.string().uuid().optional(),
	assigned_to: z.string().uuid().optional().nullable(),
	expected_close_date: isoDate.optional().nullable()
});

export const updateOpportunitySchema = z.object({
	title: z.string().trim().min(1).max(200).optional(),
	value: moneyString.optional().nullable(),
	assigned_to: z.string().uuid().nullable().optional(),
	expected_close_date: isoDate.nullable().optional(),
	// Per-deal follow-up reminder. UTC ISO 8601 (the UI sends fromZonedTime(...).
	// toISOString()) or null to clear. Mirrors contacts.next_follow_up_at.
	next_follow_up_at: z
		.string()
		.datetime({ offset: true })
		.nullable()
		.optional()
		.or(z.literal('').transform(() => null))
});

// Open→open drag between board columns. Won/Lost are NOT stages anymore — they
// are a status transition handled by markStatusSchema below.
export const moveStageSchema = z.object({
	stage_id: z.string().uuid('Invalid stage'),
	from_stage_id: z.string().uuid('Invalid from_stage_id'),
	move_request_id: z.string().uuid('Invalid move_request_id')
});

export const LOST_REASONS = ['price', 'competitor', 'timing', 'no_response', 'other'] as const;
export type LostReasonValue = (typeof LOST_REASONS)[number];

// Terminal status transition (Pipedrive/GHL "pure status" model). Only an open
// deal can be marked won/lost; reopening is intentionally not supported in v1.
export const markStatusSchema = z
	.object({
		status: z.enum(['won', 'lost'], { message: 'Status must be won or lost' }),
		request_id: z.string().uuid('Invalid request_id'),
		lost_reason: z.enum(LOST_REASONS, { message: 'Select a reason from the list.' }).optional(),
		lost_reason_note: z
			.string()
			.trim()
			.max(200, 'Note must be 200 characters or fewer')
			.nullable()
			.optional()
			.transform((v) => (v === '' ? null : v))
	})
	.refine((v) => v.status !== 'lost' || !!v.lost_reason, {
		message: 'Select a reason from the list.',
		path: ['lost_reason']
	});

// --- Stage management (1.2) ---

const hexColor = z
	.string()
	.trim()
	.regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #3B82F6');

// Trim, cap at 200 chars, and collapse empty strings to null.
const optionalDescription = z
	.string()
	.trim()
	.max(200, 'Description must be 200 characters or fewer')
	.transform((v) => (v === '' ? null : v))
	.nullable();

const probability = z
	.number()
	.int('Probability must be a whole number')
	.min(0, 'Probability must be between 0 and 100')
	.max(100, 'Probability must be between 0 and 100');

const staleAfterDays = z
	.number()
	.int('Stale-after days must be a whole number')
	.min(1, 'Stale-after days must be at least 1')
	.max(365, 'Stale-after days must be 365 or fewer');

const defaultFollowUpDays = z
	.number()
	.int('Follow-up days must be a whole number')
	.min(1, 'Follow-up days must be at least 1')
	.max(365, 'Follow-up days must be 365 or fewer');

export const createStageSchema = z.object({
	name: z.string().trim().min(1, 'Stage name is required').max(60, 'Stage name is too long'),
	color: hexColor,
	description: optionalDescription.optional(),
	probability: probability.nullable().optional(),
	stale_after_days: staleAfterDays.nullable().optional(),
	default_follow_up_days: defaultFollowUpDays.nullable().optional()
});

export const updateStageSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Stage name is required')
		.max(60, 'Stage name is too long')
		.optional(),
	color: hexColor.optional(),
	description: optionalDescription.optional(),
	probability: probability.nullable().optional(),
	stale_after_days: staleAfterDays.nullable().optional(),
	default_follow_up_days: defaultFollowUpDays.nullable().optional(),
	// Only `true` is accepted — a stage is un-defaulted by defaulting another
	// one, never directly (exactly-one-default invariant).
	is_default: z.literal(true).optional()
});

export const reorderStagesSchema = z.object({
	stage_ids: z.array(z.string().uuid('Invalid stage id')).min(1, 'No stages to reorder')
});

export const logFollowUpSchema = z.object({
	outcome: z.enum(['called', 'texted', 'emailed', 'visited', 'no_answer'], {
		message: 'Outcome must be called, texted, emailed, visited, or no_answer'
	}),
	note: z
		.string()
		.trim()
		.max(500, 'Note must be 500 characters or fewer')
		.nullable()
		.optional()
		.transform((v) => (v === '' ? null : v))
});

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
export type MoveStageInput = z.infer<typeof moveStageSchema>;
export type MarkStatusInput = z.infer<typeof markStatusSchema>;
export type CreateStageInput = z.infer<typeof createStageSchema>;
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
export type ReorderStagesInput = z.infer<typeof reorderStagesSchema>;
export type LogFollowUpInput = z.infer<typeof logFollowUpSchema>;
