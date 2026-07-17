// Client-safe request types — mirrors the server's derived-status union in
// $lib/server/requests/status.ts (that file is server-only and can't be
// imported into .svelte files).

export type RequestDerivedStatus =
	| 'needs_approval'
	| 'new'
	| 'unscheduled'
	| 'upcoming'
	| 'today'
	| 'overdue'
	| 'assessment_completed'
	| 'converted'
	| 'archived';

// List-page tab/filter values. 'upcoming' matches derived 'upcoming' AND
// 'today' (the badge still distinguishes them); the rest map 1:1.
export type RequestsFilterStatus =
	| 'all'
	| 'needs_approval'
	| 'new'
	| 'unscheduled'
	| 'upcoming'
	| 'overdue'
	| 'assessment_completed'
	| 'converted'
	| 'archived';

export type RequestsFilters = {
	status: RequestsFilterStatus;
	search: string;
	dateFrom?: string; // YYYY-MM-DD inclusive, on requested_at
	dateTo?: string;
};

export type RequestListItem = {
	id: string;
	title: string;
	source: 'internal' | 'public_form';
	approval_state: 'not_required' | 'pending' | 'accepted' | 'declined';
	converted_to_quote_id: string | null;
	converted_to_job_id: string | null;
	requested_at: string;
	created_at: string;
	contact: {
		id: string;
		full_name: string;
		company_name: string | null;
		phone: string | null;
		email: string | null;
	};
	property: string | null;
	assessment_start: string | null;
	status: RequestDerivedStatus;
};

// KPI strip payload (GET /api/requests/stats). Overview counts mirror
// Jobber's 8.jpg card: Needs approval / New / Assessment complete /
// Overdue / Unscheduled.
export type RequestStats = {
	needs_approval: number;
	new: number;
	assessment_completed: number;
	overdue: number;
	unscheduled: number;
	// "New requests, past 30 days" tile + trend vs the previous 30 days.
	new_past_30d: number;
	new_prev_30d: number;
	// % of requests created in the past 30 days that are now converted.
	conversion_rate_30d: number;
};

// ── Detail page (GET /api/requests/[id]) ────────────────────────────────────
// Client-safe mirror of RequestDetailPayload in $lib/server/requests/detail.ts.

export type RequestDetailAssessment = {
	id: string;
	title: string;
	status: 'scheduled' | 'unscheduled' | 'completed' | 'cancelled' | 'no_show';
	scheduled_start: string | null;
	scheduled_end: string | null;
	all_day: boolean;
	location: string | null;
	notes: string | null;
	assigned_to: string | null;
	assignee_ids: string[];
	completed_at: string | null;
	completion_notes: string | null;
};

export type RequestDetailLineItem = {
	id: string;
	line_key: string;
	description: string;
	details: string | null;
	quantity: string;
	unit: string | null;
	unit_price: string;
	unit_cost: string | null;
	taxable: boolean;
	source_catalog_item_id: string | null;
	total: string;
	position: number;
};

export type RequestDetailPhoto = {
	id: string;
	original_filename: string;
	thumbnail_url: string;
	web_url: string;
};

export type RequestDetail = {
	id: string;
	title: string;
	service_details: string | null;
	lead_source_answer: string | null;
	source: 'internal' | 'public_form';
	booking_link_id: string | null;
	approval_state: 'not_required' | 'pending' | 'accepted' | 'declined';
	approval_decided_at: string | null;
	converted_to_quote_id: string | null;
	converted_to_job_id: string | null;
	converted_at: string | null;
	archived_at: string | null;
	notes: string | null;
	requested_at: string;
	created_at: string;
	updated_at: string;
	status: RequestDerivedStatus;
	total: string;
	contact: {
		id: string;
		full_name: string;
		company_name: string | null;
		phone: string | null;
		email: string | null;
		status: 'lead' | 'customer' | 'archived';
	};
	line_items: RequestDetailLineItem[];
	assessment: RequestDetailAssessment | null;
	photos: RequestDetailPhoto[];
};

export type RequestLineItemDraft = {
	line_key: string;
	description: string;
	details: string;
	quantity: number;
	unit: string | null;
	unit_price: number;
	unit_cost: number | null;
	taxable: boolean;
	source_catalog_item_id: string | null;
};
