import { z } from 'zod';

const APPOINTMENT_TYPES = ['estimate', 'job_start', 'follow_up', 'inspection', 'other'] as const;

const datetime = z
	.string()
	.refine((v) => !isNaN(Date.parse(v)), 'Invalid date')
	.transform((v) => new Date(v));

const datetimeOptional = z
	.string()
	.refine((v) => !isNaN(Date.parse(v)), 'Invalid date')
	.transform((v) => new Date(v))
	.optional();

export const createAppointmentSchema = z
	.object({
		contact_id: z.string().uuid(),
		job_id: z.string().uuid().nullable().optional(),
		assigned_to: z.string().uuid().nullable().optional(),
		type: z.enum(APPOINTMENT_TYPES),
		title: z.string().trim().min(1).max(200),
		scheduled_start: datetime,
		scheduled_end: datetime,
		location: z.string().trim().max(500).nullable().optional(),
		notes: z.string().trim().max(5000).nullable().optional()
	})
	.refine((d) => d.scheduled_end.getTime() > d.scheduled_start.getTime(), {
		message: 'End time must be after start time',
		path: ['scheduled_end']
	});

export const updateAppointmentSchema = z
	.object({
		assigned_to: z.string().uuid().nullable().optional(),
		type: z.enum(APPOINTMENT_TYPES).optional(),
		title: z.string().trim().min(1).max(200).optional(),
		scheduled_start: datetimeOptional,
		scheduled_end: datetimeOptional,
		location: z.string().trim().max(500).nullable().optional(),
		notes: z.string().trim().max(5000).nullable().optional()
	})
	.refine(
		(d) => {
			if (!d.scheduled_start && !d.scheduled_end) return true;
			if (!d.scheduled_start || !d.scheduled_end) return false;
			return d.scheduled_end.getTime() > d.scheduled_start.getTime();
		},
		{
			message: 'End time must be after start time and both required when rescheduling',
			path: ['scheduled_end']
		}
	);

export const transitionStatusSchema = z.object({
	status: z.enum(['completed', 'cancelled', 'no_show'])
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type TransitionAppointmentStatusInput = z.infer<typeof transitionStatusSchema>;
