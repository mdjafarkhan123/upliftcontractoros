export type OpportunityStatus = 'open' | 'won' | 'lost';

export type LostReason = 'price' | 'competitor' | 'timing' | 'no_response' | 'other';

export const LOST_REASON_LABELS: Record<LostReason, string> = {
	price: 'Price too high',
	competitor: 'Went with competitor',
	timing: 'Bad timing',
	no_response: 'No response',
	other: 'Other'
};

export type PipelineStageRow = {
	id: string;
	name: string;
	color: string;
	position: number;
	is_default: boolean;
	stale_after_days: number | null;
	probability: number | null;
};

// Compact summary of the deal's most recent (non-draft) linked quote, surfaced
// on the pipeline card so the contractor sees quote status/age/view activity at
// a glance. Null when the deal has no sent quote yet.
export type OpportunityQuoteSummary = {
	status: 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'changes_requested';
	current_version: number;
	sent_at: string | null;
	view_count: number;
	last_viewed_at: string | null;
};

export type OpportunityRow = {
	id: string;
	title: string;
	value: string | null;
	stage_id: string;
	status: OpportunityStatus;
	contact_id: string;
	contact_name: string;
	assigned_to: string | null;
	assignee_name: string | null;
	lost_reason: LostReason | null;
	lost_reason_note: string | null;
	closed_at: string | null;
	created_at: string;
	stage_entered_at: string;
	expected_close_date: string | null;
	next_follow_up_at: string | null;
	// Last time anyone communicated with the contact — anchors the "going cold"
	// ghost nudge (idle = max of stage movement and this). Supplied by the board
	// list endpoint; optional so the richer OpportunityDetail need not carry it.
	last_contacted_at?: string | null;
	// Latest sent quote summary for the card's quote block (null = no quote sent).
	quote?: OpportunityQuoteSummary | null;
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

export type FollowUpOutcome = 'called' | 'texted' | 'emailed' | 'visited' | 'no_answer';

export type OpportunityFollowUp = {
	id: string;
	logged_by: string;
	logged_by_name: string;
	outcome: FollowUpOutcome;
	note: string | null;
	occurred_at: string;
};

export type OpportunityDetail = OpportunityRow & {
	contact_phone: string;
	contact_email: string | null;
	quotes: OpportunityQuote[];
	activity: OpportunityActivity[];
	follow_ups: OpportunityFollowUp[];
};
