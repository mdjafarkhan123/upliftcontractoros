export type JobStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type JobSource = 'opportunity' | 'manual';

export type JobListItem = {
	id: string;
	title: string;
	status: JobStatus;
	source: JobSource;
	contact_id: string;
	contact_name: string;
	assigned_to: string | null;
	assignee_name: string | null;
	scheduled_start: string | null;
	scheduled_end: string | null;
	created_at: string;
};

export type ReviewRequestStatus = 'pending' | 'sent' | 'responded' | 'failed' | 'no_response';

// A line item on a job, as served to the UI. Mirrors the quote line shape minus offer-only
// fields. quantity/unit_price/total are numeric strings (numeric columns).
export type JobLineItemRow = {
	line_key: string;
	description: string;
	details: string | null;
	quantity: string;
	unit: string | null;
	section_label: string | null;
	unit_price: string;
	unit_cost: string | null;
	source_catalog_item_id: string | null;
	total: string;
	position: number;
};

export type JobDetail = {
	id: string;
	title: string;
	status: JobStatus;
	contact_id: string;
	contact_name: string;
	contact_phone: string;
	contact_email: string | null;
	opportunity_id: string | null;
	source: JobSource;
	assigned_to: string | null;
	assignee_name: string | null;
	job_type: string | null;
	tags: string[];
	notes: string | null;
	scope_of_work: string | null;
	service_address_line_1: string | null;
	service_address_line_2: string | null;
	service_address_city: string | null;
	service_address_state: string | null;
	service_address_zip: string | null;
	scheduled_start: string | null;
	scheduled_end: string | null;
	completed_at: string | null;
	cancelled_at: string | null;
	created_at: string;
	updated_at: string;
	// Pricing snapshot (numeric strings).
	subtotal: string;
	discount_type: string;
	discount_value: string | null;
	discount_amount: string | null;
	discount_label: string | null;
	tax_rate: string;
	tax_amount: string;
	total: string;
	line_items: JobLineItemRow[];
	invoice_count: number;
	// Whether a non-cancelled invoice already exists for this job (drives Create vs View invoice).
	has_active_invoice: boolean;
	appointment_count: number;
	review_request_status: ReviewRequestStatus | null;
};

export type JobsFilterStatus = 'all' | 'scheduled' | 'in_progress' | 'completed';

export type JobsFilterScope = 'today' | 'awaiting_review' | 'unscheduled';

export type JobsFilters = {
	status: JobsFilterStatus;
	scope: JobsFilterScope | null;
	assignedTo: string | null;
	contactId: string | null;
	search: string;
};

export type JobsStats = {
	today: number;
	in_progress: number;
	awaiting_review: number;
	unscheduled: number;
};
