import { z } from 'zod';

const datetimeNullable = z
	.union([z.string(), z.null()])
	.refine(
		(v) => v === null || (typeof v === 'string' && !isNaN(Date.parse(v))),
		'Invalid date'
	)
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

export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type TransitionStatusInput = z.infer<typeof transitionStatusSchema>;
