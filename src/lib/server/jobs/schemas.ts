import { z } from 'zod';

const datetimeNullable = z
	.union([z.string(), z.null()])
	.refine((v) => v === null || (typeof v === 'string' && !isNaN(Date.parse(v))), 'Invalid date')
	.transform((v) => (v === null ? null : new Date(v)));

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
		title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
		status: z.enum(['scheduled', 'in_progress', 'completed']).optional().default('scheduled'),
		assigned_to: z.string().uuid().nullable().optional(),
		scheduled_start: datetimeNullable.optional(),
		scheduled_end: datetimeNullable.optional(),
		scope_of_work: nullableTrimmed(10000),
		notes: nullableTrimmed(5000),
		service_address_line_1: nullableTrimmed(200),
		service_address_line_2: nullableTrimmed(200),
		service_address_city: nullableTrimmed(100),
		service_address_state: nullableTrimmed(100),
		service_address_zip: nullableTrimmed(20)
	})
	.refine(
		(d) =>
			!(d.scheduled_start && d.scheduled_end) ||
			d.scheduled_end.getTime() >= d.scheduled_start.getTime(),
		{ message: 'Scheduled end must be after start', path: ['scheduled_end'] }
	);

export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type TransitionStatusInput = z.infer<typeof transitionStatusSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
