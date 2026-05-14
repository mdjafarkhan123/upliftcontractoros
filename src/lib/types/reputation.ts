export type ReviewListItem = {
	id: string;
	contact_id: string;
	contact_name: string;
	job_id: string;
	job_title: string | null;
	score: number;
	platform: string | null;
	body: string | null;
	created_at: string;
};

export type PrivateFeedbackListItem = {
	id: string;
	contact_id: string;
	contact_name: string;
	job_id: string;
	job_title: string | null;
	score: number;
	body: string | null;
	is_resolved: boolean;
	resolved_at: string | null;
	created_at: string;
};

export type PrivateFeedbackDetail = PrivateFeedbackListItem & {
	resolved_by: string | null;
	resolved_by_name: string | null;
};

export type ReviewRequestListItem = {
	id: string;
	job_id: string;
	job_title: string | null;
	job_status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
	contact_id: string;
	contact_name: string;
	status: 'pending' | 'sent' | 'responded' | 'failed' | 'no_response';
	response_score: number | null;
	sent_by_automation: boolean;
	sent_at: string | null;
	responded_at: string | null;
	created_at: string;
};

export type ReputationSummary = {
	total_reviews: number;
	avg_score: number | null;
	reviews_this_month: number;
	pending_requests: number;
	negative_count: number | null;
};
