export type DashboardActivityIcon =
	| 'payment'
	| 'quote_accepted'
	| 'quote_viewed'
	| 'quote_declined'
	| 'opportunity_won'
	| 'job_completed'
	| 'lead'
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
	is_won: boolean;
	is_lost: boolean;
	count: number;
	value: string;
};

export type DashboardSummary = {
	generated_at: string;
	timezone: string;
	kpis: {
		leads: { new_this_month: number; conversion_rate: number | null };
		jobs_won: { count_this_month: number; value_this_month: string };
		revenue: { this_month: string; outstanding: string } | null;
	};
	attention: {
		overdue_invoices_count: number;
		overdue_invoices_total: string;
		quotes_awaiting_count: number;
		jobs_today_count: number;
	};
	pipeline_snapshot: DashboardPipelineStage[] | null;
	recent_activity: DashboardActivityRow[];
	locks: {
		revenue_locked: boolean;
		pipeline_locked: boolean;
	};
	degraded: string[];
};
