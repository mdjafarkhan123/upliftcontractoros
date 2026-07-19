export type AppointmentType = 'estimate' | 'job_start' | 'follow_up' | 'inspection' | 'other';
export type AppointmentStatus = 'scheduled' | 'unscheduled' | 'completed' | 'cancelled' | 'no_show';
export type AppointmentView = 'list' | 'calendar';
export type CalendarRange = 'day' | 'week' | 'month';
// Time-grid zoom: how tall each hour row renders. Compact fits more of the day
// on screen; Spacious gives cards room for full meta.
export type CalendarDensity = 'compact' | 'comfortable' | 'spacious';

export type BookingSource = 'internal' | 'booking_link';

export type AppointmentListItem = {
	id: string;
	contact_id: string;
	contact_name: string;
	// Present so the drag-reschedule confirm popover can offer the right notify
	// channels (SMS needs a phone, email needs an address).
	contact_phone: string | null;
	contact_email: string | null;
	job_id: string | null;
	// Non-null = this visit is a Request's on-site assessment. Drives the "Assessment"
	// identity on the calendar card and its click-through to /requests/[id].
	request_id: string | null;
	assigned_to: string | null;
	assignee_name: string | null;
	assignee_count: number;
	type: AppointmentType;
	status: AppointmentStatus;
	title: string;
	// True when this visit's parent job carries a repeat RULE — i.e. the visit is one
	// of a generated series, so the card shows the recurring glyph. This is NOT
	// `job_type`: a ONE-OFF job may repeat (the toggle decides how the job BILLS, the
	// rule decides how visits are GENERATED — they are independent). "As needed" jobs
	// generate no visits, so any visit on one was added by hand and is not a series.
	is_recurring_visit: boolean;
	// "Anytime" visit: has a date but no clock time. Rendered in the calendar's top
	// Anytime lane; scheduled_end is null for these.
	all_day: boolean;
	scheduled_start: string;
	scheduled_end: string | null;
	location: string | null;
	// Crew-facing instructions (the assessment/visit notes), shown in the detail popover.
	notes: string | null;
	booking_source: BookingSource;
};

export type AppointmentAssigneeRow = {
	id: string;
	full_name: string;
	is_lead: boolean;
};

export type AppointmentDetail = {
	id: string;
	contact_id: string;
	contact_name: string;
	job_id: string | null;
	job_title: string | null;
	assigned_to: string | null;
	assignee_name: string | null;
	assignees: AppointmentAssigneeRow[];
	type: AppointmentType;
	status: AppointmentStatus;
	title: string;
	all_day: boolean;
	// NULL for an unscheduled "Schedule later" visit that has no date yet.
	scheduled_start: string | null;
	scheduled_end: string | null;
	location: string | null;
	notes: string | null;
	reminder_24h_sent: boolean;
	reminder_1h_sent: boolean;
	cancelled_at: string | null;
	created_at: string;
	updated_at: string;
	booking_source: BookingSource;
	booked_via_link_id: string | null;
	customer_name: string | null;
	customer_phone: string | null;
	customer_email: string | null;
	customer_notes: string | null;
	booking_referrer: string | null;
	// Side-effect echo (write-through): present ONLY on a PATCH that moved this visit and thereby
	// re-pinned its parent one-off job's schedule in the same transaction. The client keeps a
	// SEPARATE jobs cache, so it uses this to patch the job's row/detail (and its Today/Upcoming
	// badge) without a refetch. Absent on GET and when no job was repinned (event / recurring job).
	affected_job?: {
		id: string;
		scheduled_start: string | null;
		scheduled_end: string | null;
	} | null;
};

export type AppointmentsFilters = {
	from: string;
	to: string;
	status: AppointmentStatus | 'all';
	assignedTo: string | null;
	// Free-text search term. When non-empty, the query searches across ALL dates
	// (from/to ignored) and the result is a flat, nearest-first list.
	search: string;
};
