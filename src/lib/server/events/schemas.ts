import { z } from 'zod';

// Calendar Event validation (Jobber `Event` model). Unlike an appointment/visit,
// a customer is OPTIONAL and there is no `type` — an Event is just a non-billable
// time block (meeting, holiday, PTO, maintenance). Recurrence is a later phase.

const datetime = z
	.string()
	.refine((v) => !isNaN(Date.parse(v)), 'Invalid date')
	.transform((v) => new Date(v));

// Accepts a valid date string, OR null/undefined. All-day events carry no end
// time, so the client legitimately sends `end_at: null`.
const datetimeOptional = z
	.string()
	.refine((v) => !isNaN(Date.parse(v)), 'Invalid date')
	.transform((v) => new Date(v))
	.nullable()
	.optional();

export const createEventSchema = z
	.object({
		// Customer is OPTIONAL for an Event — the whole point of the separate table.
		contact_id: z.string().uuid().nullable().optional(),
		// Legacy single-assignee field — still accepted, treated as a crew of one.
		assigned_to: z.string().uuid().nullable().optional(),
		// Multi-assignee shape. If omitted, falls back to `assigned_to`.
		assignee_ids: z.array(z.string().uuid()).max(20).optional(),
		lead_member_id: z.string().uuid().nullable().optional(),
		title: z.string().trim().min(1).max(200),
		description: z.string().trim().max(5000).nullable().optional(),
		// All-day block (holiday / PTO): `end_at` is ignored (forced NULL at the API
		// layer) and only a date (`start_at`) is required.
		all_day: z.boolean().optional().default(false),
		start_at: datetime,
		end_at: datetimeOptional,
		location: z.string().trim().max(500).nullable().optional(),
		team_reminder_offset_minutes: z.number().int().min(0).max(10080).nullable().optional()
	})
	// Timed events require an end time…
	.refine((d) => d.all_day || d.end_at != null, {
		message: 'End time is required.',
		path: ['end_at']
	})
	// …and it must be after the start. (All-day events skip both checks.)
	.refine((d) => d.all_day || !d.end_at || d.end_at.getTime() > d.start_at.getTime(), {
		message: 'End time must be after start time',
		path: ['end_at']
	});

export const updateEventSchema = z
	.object({
		contact_id: z.string().uuid().nullable().optional(),
		assigned_to: z.string().uuid().nullable().optional(),
		assignee_ids: z.array(z.string().uuid()).max(20).optional(),
		lead_member_id: z.string().uuid().nullable().optional(),
		title: z.string().trim().min(1).max(200).optional(),
		description: z.string().trim().max(5000).nullable().optional(),
		all_day: z.boolean().optional(),
		start_at: datetimeOptional,
		end_at: datetimeOptional,
		location: z.string().trim().max(500).nullable().optional(),
		team_reminder_offset_minutes: z.number().int().min(0).max(10080).nullable().optional()
	})
	.refine(
		(d) => {
			// Becoming/staying all-day: a start alone (or nothing) is valid.
			if (d.all_day === true) return true;
			if (!d.start_at && !d.end_at) return true;
			if (!d.start_at || !d.end_at) return false;
			return d.end_at.getTime() > d.start_at.getTime();
		},
		{
			message: 'End time must be after start time and both required when rescheduling',
			path: ['end_at']
		}
	);

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
