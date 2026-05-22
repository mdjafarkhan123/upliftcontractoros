export type AppointmentType = 'estimate' | 'job_start' | 'follow_up' | 'inspection' | 'other';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
export type AppointmentView = 'list' | 'calendar';
export type CalendarRange = 'day' | 'week';

export type BookingSource = 'internal' | 'booking_link';

export type AppointmentListItem = {
	id: string;
	contact_id: string;
	contact_name: string;
	job_id: string | null;
	assigned_to: string | null;
	assignee_name: string | null;
	type: AppointmentType;
	status: AppointmentStatus;
	title: string;
	scheduled_start: string;
	scheduled_end: string | null;
	location: string | null;
	booking_source: BookingSource;
};

export type AppointmentDetail = {
	id: string;
	contact_id: string;
	contact_name: string;
	job_id: string | null;
	job_title: string | null;
	assigned_to: string | null;
	assignee_name: string | null;
	type: AppointmentType;
	status: AppointmentStatus;
	title: string;
	scheduled_start: string;
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
};

export type AppointmentsFilters = {
	from: string;
	to: string;
	status: AppointmentStatus | 'all';
	assignedTo: string | null;
};
