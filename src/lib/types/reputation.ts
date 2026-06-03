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
	status: 'scheduled' | 'sent' | 'engaged' | 'likely_reviewed' | 'completed_internal' | 'expired';
	submitted_rating: number | null;
	sent_by_automation: boolean;
	sent_at: string | null;
	engaged_at: string | null;
	redirected_to_google_at: string | null;
	completed_at: string | null;
	expired_at: string | null;
	attributed_at: string | null;
	confidence_score: number | null;
	nudge_count: number;
	token_expires_at: string | null;
	created_at: string;
	// Derived server-side: true when status IN ('sent', 'engaged') and the
	// token_expires_at is in the past. UI renders these as "Expired" without
	// a sweeper.
	is_expired: boolean;
};

export type EligibleJob = {
	job_id: string;
	job_title: string | null;
	contact_id: string;
	contact_name: string;
	completed_at: string | null;
};

export type FunnelPeriod = '7d' | '30d' | '90d';

export type FunnelSummary = {
	period: FunnelPeriod;
	sent: number;
	opened: number;
	rated: number;
	converted: number;
	star_distribution: {
		'1': number;
		'2': number;
		'3': number;
		'4': number;
		'5': number;
	};
};

export type ReviewEventType =
	| 'sent'
	| 'link_opened'
	| 'rating_submitted'
	| 'redirected_to_google'
	| 'reminder_sent'
	| 'nudge_sent'
	| 'expired'
	| 'attributed';

export type ReviewEventListItem = {
	id: string;
	type: ReviewEventType;
	rating: number | null;
	nudge_number: number | null;
	confidence_score: number | null;
	created_at: string;
};

export type ReputationSummary = {
	total_reviews: number;
	avg_score: number | null;
	reviews_this_month: number;
	pending_requests: number;
	negative_count: number | null;
	last_known_review_count: number | null;
	last_review_check_at: string | null;
};
