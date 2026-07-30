// Invoice reminders as they appear on the Schedule calendar (Deliverable 2). A reminder
// is a contractor to-do — "on this date, remember to invoice this job" — that Jobber shows
// as a dated task on the calendar alongside visits and Events. Mirrors the GET
// /api/jobs/reminders windowed feed. Read-only on the grid (reminders never drag/resize).

import type { JobInvoiceReminderRow } from '$lib/types/jobs';

// A reminder row plus the job/client context the calendar card + detail popover need.
// Extends the job-page reminder row (description, timing, status, crew) so the shared
// InvoiceReminderDetailPopover renders it directly.
export type ReminderCalendarItem = JobInvoiceReminderRow & {
	job_id: string;
	job_title: string;
	// jobs.contact_id is NOT NULL, so these are always present for a reminder's job.
	contact_id: string;
	contact_name: string;
	contact_phone: string | null;
	contact_email: string | null;
};

export type RemindersFilters = {
	from: string;
	to: string;
	assignedTo: string | null;
};
