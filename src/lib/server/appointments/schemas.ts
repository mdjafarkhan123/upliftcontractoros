import { z } from 'zod';

const APPOINTMENT_TYPES = ['estimate', 'job_start', 'follow_up', 'inspection', 'other'] as const;

const datetime = z
	.string()
	.refine((v) => !isNaN(Date.parse(v)), 'Invalid date')
	.transform((v) => new Date(v));

// Accepts a valid date string, OR null/undefined. "Anytime" visits carry no end
// time, so the client legitimately sends `scheduled_end: null` — treat null the
// same as an omitted value (the route forces it to NULL for all_day anyway).
const datetimeOptional = z
	.string()
	.refine((v) => !isNaN(Date.parse(v)), 'Invalid date')
	.transform((v) => new Date(v))
	.nullable()
	.optional();

export const createAppointmentSchema = z
	.object({
		contact_id: z.string().uuid(),
		job_id: z.string().uuid().nullable().optional(),
		// Parent request when this appointment is an on-site ASSESSMENT (Jobber).
		// Forces type 'estimate' at the API layer; at most one live assessment per
		// request (partial unique index). Immutable after create — a request's
		// assessment is rescheduled/completed, never re-pointed.
		request_id: z.string().uuid().nullable().optional(),
		// Legacy single-assignee field — still accepted, treated as a crew of one.
		assigned_to: z.string().uuid().nullable().optional(),
		// New multi-assignee shape. If omitted, falls back to `assigned_to`.
		assignee_ids: z.array(z.string().uuid()).max(20).optional(),
		lead_member_id: z.string().uuid().nullable().optional(),
		type: z.enum(APPOINTMENT_TYPES),
		title: z.string().trim().min(1).max(200),
		// "Anytime" visit: a date with no clock time. When true, scheduled_end is ignored
		// (forced NULL at the API layer) and no end time is required.
		all_day: z.boolean().optional().default(false),
		// Nullable so the "Schedule later" path can create an unscheduled visit (no date yet,
		// Jobber's placeholder). A null start ⇒ the API inserts status 'unscheduled' with no
		// reminders; a real date ⇒ status 'scheduled'.
		scheduled_start: datetimeOptional,
		scheduled_end: datetimeOptional,
		location: z.string().trim().max(500).nullable().optional(),
		notes: z.string().trim().max(5000).nullable().optional()
	})
	// A visit belongs to a job OR a request, never both.
	.refine((d) => !(d.job_id && d.request_id), {
		message: 'An appointment cannot belong to both a job and a request.',
		path: ['request_id']
	})
	// Timed visits require an end time… (an unscheduled or Anytime visit needs neither).
	.refine((d) => d.all_day || d.scheduled_start == null || d.scheduled_end != null, {
		message: 'End time is required.',
		path: ['scheduled_end']
	})
	// …and it must be after the start. (Anytime / unscheduled visits skip both checks.)
	.refine(
		(d) =>
			d.all_day ||
			!d.scheduled_start ||
			!d.scheduled_end ||
			d.scheduled_end.getTime() > d.scheduled_start.getTime(),
		{ message: 'End time must be after start time', path: ['scheduled_end'] }
	);

export const updateAppointmentSchema = z
	.object({
		assigned_to: z.string().uuid().nullable().optional(),
		assignee_ids: z.array(z.string().uuid()).max(20).optional(),
		lead_member_id: z.string().uuid().nullable().optional(),
		type: z.enum(APPOINTMENT_TYPES).optional(),
		title: z.string().trim().min(1).max(200).optional(),
		// Toggle a visit between timed and "Anytime". When set true, the API forces
		// scheduled_end to NULL and only a scheduled_start (the date) is needed.
		all_day: z.boolean().optional(),
		scheduled_start: datetimeOptional,
		scheduled_end: datetimeOptional,
		location: z.string().trim().max(500).nullable().optional(),
		notes: z.string().trim().max(5000).nullable().optional(),
		// Per-visit free note (Visit Details modal → Notes tab). Same column the completion flow
		// writes; editable independently here, on any status. Empty/whitespace collapses to null.
		// Omitted stays `undefined` (leave column alone) — only an explicit value/empty writes.
		completion_notes: z
			.string()
			.trim()
			.max(5000)
			.nullable()
			.optional()
			.transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
		// Optional client reschedule notification. Only honoured on a real
		// reschedule (start/end actually moved) and when != 'none'. Mirrors the
		// job reschedule channel picker.
		notify_channel: z.enum(['sms', 'email', 'both', 'none']).optional(),
		// Optional per-reschedule copy overrides edited in the notify dialog. Null/omitted =
		// the worker falls back to the org's appointment_confirmation_* template. Limits mirror
		// the job overrides + settings limits. The worker interpolates merge tokens at send time.
		notify_sms_message: z.string().trim().max(500).nullable().optional(),
		notify_email_subject: z.string().trim().max(200).nullable().optional(),
		notify_email_message: z.string().trim().max(2000).nullable().optional()
	})
	.refine(
		(d) => {
			// Becoming/staying an Anytime visit: a start alone (or nothing) is valid.
			if (d.all_day === true) return true;
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
	// 'completed' / 'cancelled' / 'no_show' are forward transitions. 'incomplete' is the reverse
	// action (Jobber's "Mark as incomplete"): it un-completes a completed visit, sending it back
	// to 'scheduled' if it has a date or 'unscheduled' if it doesn't — the endpoint resolves which.
	status: z.enum(['completed', 'cancelled', 'no_show', 'incomplete']),
	// Per-visit completion note (S5). Only stored when transitioning to 'completed'; ignored for
	// cancelled / no_show / incomplete. Empty/whitespace collapses to null.
	completion_notes: z
		.string()
		.trim()
		.max(5000)
		.nullable()
		.optional()
		.transform((v) => (v && v.length > 0 ? v : null))
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type TransitionAppointmentStatusInput = z.infer<typeof transitionStatusSchema>;
