import { z } from 'zod';

// Invoice reminder validation (Jobber `INVOICE_REMINDER`). A reminder is a
// contractor to-do tied to a job: a description, an optional schedule (date/time,
// "Anytime", or "schedule later" = no date yet), a crew, and a notify flag.
// Shares the assignee shape with events/appointments.

// A valid date string, OR null/undefined. "Schedule later" reminders send null
// start; all-day reminders send null end.
const datetimeOptional = z
	.string()
	.refine((v) => !isNaN(Date.parse(v)), 'Invalid date')
	.transform((v) => new Date(v))
	.nullable()
	.optional();

export const createReminderSchema = z
	.object({
		description: z.string().trim().max(5000).nullable().optional(),
		// Multi-assignee shape (falls back to legacy single `assigned_to`).
		assigned_to: z.string().uuid().nullable().optional(),
		assignee_ids: z.array(z.string().uuid()).max(20).optional(),
		lead_member_id: z.string().uuid().nullable().optional(),
		all_day: z.boolean().optional().default(false),
		// Null / omitted = "schedule later" (no date yet).
		scheduled_start: datetimeOptional,
		scheduled_end: datetimeOptional,
		notify_team_on_assign: z.boolean().optional().default(false)
	})
	// A timed reminder (has a start, not all-day) needs an end time…
	.refine((d) => d.all_day || d.scheduled_start == null || d.scheduled_end != null, {
		message: 'End time is required.',
		path: ['scheduled_end']
	})
	// …and it must be after the start.
	.refine(
		(d) =>
			d.all_day ||
			d.scheduled_start == null ||
			d.scheduled_end == null ||
			d.scheduled_end.getTime() > d.scheduled_start.getTime(),
		{ message: 'End time must be after start time', path: ['scheduled_end'] }
	);

export const updateReminderSchema = z
	.object({
		description: z.string().trim().max(5000).nullable().optional(),
		assigned_to: z.string().uuid().nullable().optional(),
		assignee_ids: z.array(z.string().uuid()).max(20).optional(),
		lead_member_id: z.string().uuid().nullable().optional(),
		all_day: z.boolean().optional(),
		scheduled_start: datetimeOptional,
		scheduled_end: datetimeOptional,
		notify_team_on_assign: z.boolean().optional(),
		// Complete / reopen the reminder.
		status: z.enum(['active', 'completed']).optional()
	})
	.refine(
		(d) => {
			// All-day, or no schedule change, or schedule-later → fine.
			if (d.all_day === true) return true;
			if (d.scheduled_start == null && d.scheduled_end == null) return true;
			if (d.scheduled_start == null || d.scheduled_end == null) return false;
			return d.scheduled_end.getTime() > d.scheduled_start.getTime();
		},
		{
			message: 'End time must be after start time and both required when scheduling',
			path: ['scheduled_end']
		}
	);

export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
