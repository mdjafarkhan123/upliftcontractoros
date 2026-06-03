export type PipelineStageRow = {
	id: string;
	name: string;
	color: string;
	position: number;
	is_default: boolean;
	is_won: boolean;
	is_lost: boolean;
	stale_after_days: number | null;
	probability: number | null;
};

export type OpportunityRow = {
	id: string;
	title: string;
	value: string | null;
	stage_id: string;
	contact_id: string;
	contact_name: string;
	assigned_to: string | null;
	assignee_name: string | null;
	lost_reason: string | null;
	closed_at: string | null;
	created_at: string;
	stage_entered_at: string;
	expected_close_date: string | null;
};

export type OpportunityQuote = {
	id: string;
	quote_number_display: string;
	title: string;
	status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'changes_requested';
	total: string;
	created_at: string;
	sent_at: string | null;
	viewed_at: string | null;
};

export type OpportunityActivityKind =
	| 'stage'
	| 'assignee'
	| 'quote_sent'
	| 'quote_viewed'
	| 'quote_accepted'
	| 'quote_declined'
	| 'created'
	| 'won'
	| 'lost';

export type OpportunityActivity = {
	id: string;
	kind: OpportunityActivityKind;
	summary: string;
	occurred_at: string;
};

export type OpportunityDetail = OpportunityRow & {
	contact_phone: string;
	contact_email: string | null;
	quotes: OpportunityQuote[];
	activity: OpportunityActivity[];
};
