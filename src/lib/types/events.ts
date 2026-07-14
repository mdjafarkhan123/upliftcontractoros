// Calendar Event (Jobber `Event` model) — a NON-billable, customer-OPTIONAL time
// block (team meeting, holiday, PTO, equipment maintenance) that shares the
// calendar grid with visits but is a separate object. No `type`, no money.
// Mirrors the GET /api/events response shape.

export type EventListItem = {
	id: string;
	// Customer is OPTIONAL for an Event — both may be null.
	contact_id: string | null;
	contact_name: string | null;
	assigned_to: string | null;
	assignee_name: string | null;
	assignee_count: number;
	title: string;
	description: string | null;
	// "All-day" events carry only a start date; `end_at` is null for those.
	start_at: string | null;
	end_at: string | null;
	all_day: boolean;
	location: string | null;
};

export type EventsFilters = {
	from: string;
	to: string;
	assignedTo: string | null;
};
