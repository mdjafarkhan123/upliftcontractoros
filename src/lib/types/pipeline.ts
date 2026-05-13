export type PipelineStageRow = {
	id: string;
	name: string;
	color: string;
	position: number;
	is_default: boolean;
	is_won: boolean;
	is_lost: boolean;
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
};

export type OpportunityDetail = OpportunityRow & {
	contact_phone: string;
	contact_email: string | null;
};
