export type DashboardActivityIcon =
	| 'payment'
	| 'quote_accepted'
	| 'quote_viewed'
	| 'quote_declined'
	| 'quote_sent'
	| 'opportunity_created'
	| 'opportunity_stage_changed'
	| 'opportunity_assignee_changed'
	| 'opportunity_won'
	| 'opportunity_lost'
	| 'job_completed'
	| 'lead'
	| 'contact_became_customer'
	| 'review_received';

export type DashboardActivityTone = 'neutral' | 'positive' | 'attention' | 'negative';

export type DashboardActivityRow = {
	id: string;
	icon_key: DashboardActivityIcon;
	tone: DashboardActivityTone;
	label: string;
	target_route: string;
	occurred_at: string;
	// Forward-compat weight for future sorting/ranking.
	// Not used in v1; rows are still ordered chronologically.
	priority: number;
};

export type DashboardPipelineStage = {
	stage_id: string;
	name: string;
	color: string;
	position: number;
	count: number;
	value: string;
};

export type DashboardTodayJob = {
	id: string;
	title: string;
	contact_name: string | null;
	status: 'scheduled' | 'in_progress';
	scheduled_start: string;
	scheduled_end: string | null;
};

export type DashboardMissedCallRecovery = {
	missed_count: number;
	recovered_count: number;
};

export type DashboardReputation = {
	funnel_enabled: boolean;
	total_reviews: number;
	avg_rating: number | null;
	reviews_this_month: number;
	reviews_last_month: number;
	requests_this_month: number;
};

export type DashboardPeriod = 'month' | 'year';

export type DashboardSummary = {
	generated_at: string;
	timezone: string;
	/** Time window for the flow KPIs (leads, jobs won, revenue). Balance cards ignore it. */
	period: DashboardPeriod;
	kpis: {
		leads: { new_this_period: number; conversion_rate: number | null; new_last_period: number };
		jobs_won: { count_this_period: number; value_this_period: string; count_last_period: number };
		revenue: { this_period: string; outstanding: string; last_period: string } | null;
	};
	attention: {
		overdue_invoices_count: number;
		overdue_invoices_total: string;
		quotes_awaiting_count: number;
		quotes_awaiting_total: string;
		aging_leads_count: number;
		unread_conversations_count: number;
	};
	today_schedule: DashboardTodayJob[];
	missed_call_recovery: DashboardMissedCallRecovery | null;
	pipeline_snapshot: DashboardPipelineStage[] | null;
	recent_activity: DashboardActivityRow[];
	reputation: DashboardReputation | null;
	locks: {
		revenue_locked: boolean;
		pipeline_locked: boolean;
	};
	degraded: string[];
};
