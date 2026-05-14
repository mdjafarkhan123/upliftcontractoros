export type QuoteStatus =
	| 'draft'
	| 'sent'
	| 'viewed'
	| 'accepted'
	| 'declined'
	| 'expired';

export type QuotesGroup = 'all' | 'active' | 'closed';
export type QuotesStatusChip = 'all' | QuoteStatus;

export type QuotesFilters = {
	group: QuotesGroup;
	status: QuotesStatusChip;
};

export type QuoteListItem = {
	id: string;
	quote_number: number;
	quote_number_display: string;
	title: string;
	status: QuoteStatus;
	total: string;
	contact_id: string;
	contact_name: string;
	sent_at: string | null;
	viewed_at: string | null;
	accepted_at: string | null;
	declined_at: string | null;
	expires_at: string | null;
	created_at: string;
};

export type QuoteLineItemRow = {
	id: string;
	description: string;
	quantity: string;
	unit_price: string;
	total: string;
	position: number;
};

export type QuoteLineDraft = {
	client_id: string;
	description: string;
	quantity: string;
	unit_price: string;
};

export type QuoteDetail = {
	id: string;
	quote_number: number;
	quote_number_display: string;
	title: string;
	status: QuoteStatus;
	subtotal: string;
	tax_rate: string;
	tax_amount: string;
	total: string;
	deposit_required: boolean;
	deposit_amount: string | null;
	notes: string | null;
	internal_notes: string | null;
	expires_at: string | null;
	sent_at: string | null;
	viewed_at: string | null;
	accepted_at: string | null;
	declined_at: string | null;
	created_at: string;
	updated_at: string;
	contact_id: string;
	contact_name: string;
	contact_phone: string;
	contact_email: string | null;
	opportunity_id: string | null;
	view_count: number;
	line_items: QuoteLineItemRow[];
};

export type QuoteTemplateListItem = {
	id: string;
	name: string;
	description: string | null;
	line_item_count: number;
	created_at: string;
};

export type QuoteTemplateDetail = QuoteTemplateListItem & {
	line_items: QuoteLineItemRow[];
};

export type PublicQuoteView = {
	quote_number_display: string;
	title: string;
	subtotal: string;
	tax_rate: string;
	tax_amount: string;
	total: string;
	deposit_required: boolean;
	deposit_amount: string | null;
	notes: string | null;
	expires_at: string | null;
	status: QuoteStatus;
	org_name: string;
	contact_name: string;
	line_items: QuoteLineItemRow[];
};
