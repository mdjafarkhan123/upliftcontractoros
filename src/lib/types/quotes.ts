export type QuoteStatus =
	| 'draft'
	| 'sent'
	| 'viewed'
	| 'accepted'
	| 'declined'
	| 'expired'
	| 'changes_requested';

export type QuoteChangeRequestSummary = {
	id: string;
	message: string;
	requested_at: string;
};

export type QuoteTimelineEventType =
	| 'sent'
	| 'viewed'
	| 'revision_requested'
	| 'accepted'
	| 'declined';

export type QuoteTimelineEvent = {
	type: QuoteTimelineEventType;
	version: number;
	at: string;
	total?: string;
	view_count?: number;
};

// A single frozen line item inside a version snapshot, as served to the UI.
export type QuoteVersionLineItemView = {
	description: string;
	details?: string | null;
	quantity: string;
	unit: string | null;
	section_label: string | null;
	is_optional?: boolean;
	unit_price: string;
	total: string;
	position: number;
};

// One immutable version of a quote, with its frozen line items and a change
// summary vs the previous version. `change` is null for the first version.
export type QuoteVersionDetail = {
	version: number;
	sent_at: string;
	subtotal: string;
	// Discount dollars-off frozen at this version, derived from subtotal/tax/total so the
	// snapshot reconciles on screen. Null/'0.00' = no discount on that version.
	discount_amount: string | null;
	tax_rate: string;
	tax_amount: string;
	total: string;
	item_count: number;
	line_items: QuoteVersionLineItemView[];
	change: {
		prev_version: number;
		prev_item_count: number;
		prev_total: string;
		item_count_delta: number;
		total_delta: string;
	} | null;
};

// A contact address as surfaced on a quote (job site). Resolved from the linked
// contact_addresses row; null on the quote when no service address is set.
export type QuoteServiceAddress = {
	id: string;
	label: 'billing' | 'service' | 'mailing' | 'other';
	address_line_1: string;
	address_line_2: string | null;
	city: string;
	state: string;
	zip: string;
};

export type QuotesGroup = 'all' | 'active' | 'closed';
export type QuotesStatusChip = 'all' | QuoteStatus;

// Org-wide quote performance summary shown above the quotes list (Stage 3.1).
// All figures are org-scoped and independent of the active list filter.
export type QuoteStats = {
	// Total $ value of quotes currently live with clients (sent + viewed + changes_requested).
	open_value: string;
	// Count of quotes sent or viewed but not yet acted on by the client.
	awaiting_count: number;
	// accepted / (accepted + declined + expired) over the last 90 days. Null when nothing decided.
	acceptance_rate: number | null;
	accepted_90: number;
	decided_90: number;
	// Average days from sent → accepted over the last 90 days. Null when no accepts.
	avg_days_to_accept: number | null;
};

export type QuotesFilters = {
	group: QuotesGroup;
	status: QuotesStatusChip;
	search: string;
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

// A photo attached to a single quote line item, with short-lived signed URLs.
// thumb_url drives the inline thumbnail; full_url is the high-res lightbox image.
export type QuoteLinePhoto = {
	id: string;
	thumb_url: string;
	full_url: string;
};

export type QuoteLineItemRow = {
	id: string;
	// Stable per-line identity that survives the save's wipe-and-reinsert. Photos bind to it.
	// Optional because template line items have no line_key column.
	line_key?: string;
	// Per-line photos (signed URLs). Present on quote read paths; absent on templates.
	photos?: QuoteLinePhoto[];
	// Title (short name) of the line. Always present.
	description: string;
	// Optional longer description shown under the title. Null/absent when none.
	details?: string | null;
	quantity: string;
	unit: string | null;
	// Optional section/group heading. Items sharing a label render under one heading.
	section_label?: string | null;
	// Optional add-on flag + whether the customer selected it at acceptance. accepted_selected
	// is only meaningful once the quote is accepted; false on required lines and unchosen add-ons.
	is_optional?: boolean;
	accepted_selected?: boolean;
	unit_price: string;
	// Cost snapshot + catalog link. Present on quote line items; absent on template lines.
	unit_cost?: string | null;
	source_catalog_item_id?: string | null;
	total: string;
	position: number;
};

export type QuoteLineDraft = {
	client_id: string;
	// Stable per-line identity persisted to quote_line_items.line_key, so per-line photos
	// stay bound across saves. Generated once on the client when the line is created.
	line_key?: string;
	// Title (short name) of the line.
	description: string;
	// Optional longer description shown under the title.
	details?: string | null;
	quantity: string;
	unit: string;
	// Section/group heading this line belongs to. Null/undefined = ungrouped.
	section_label?: string | null;
	// Optional add-on the customer can choose before accepting. Excluded from base total.
	is_optional?: boolean;
	unit_price: string;
	// Carried through so a line added from the catalog keeps its cost snapshot + link
	// across save/edit. Undefined for hand-typed lines.
	unit_cost?: string | null;
	source_catalog_item_id?: string | null;
};

// A row in the org's Product / Service Catalog, as served to the browser.
export type CatalogItem = {
	id: string;
	name: string;
	description: string | null;
	unit_price: string;
	unit: string | null;
	unit_cost: string | null;
	category: string | null;
	image_url: string | null;
	created_at: string;
	updated_at: string;
};

export type QuoteDetail = {
	id: string;
	quote_number: number;
	quote_number_display: string;
	title: string;
	status: QuoteStatus;
	current_version: number;
	subtotal: string;
	// Quote-level discount applied before tax. discount_amount is the server-computed
	// dollars-off (null when discount_type is 'none').
	discount_type: string;
	discount_value: string | null;
	discount_amount: string | null;
	discount_label: string | null;
	tax_rate: string;
	tax_amount: string;
	total: string;
	deposit_required: boolean;
	deposit_type: string;
	deposit_percent: string | null;
	deposit_amount: string | null;
	deposit_paid_amount: number;
	deposit_paid_at: string | null;
	// Frozen final figures = base + customer-selected optional add-ons. Null until accepted.
	accepted_subtotal: string | null;
	accepted_tax_amount: string | null;
	accepted_total: string | null;
	notes: string | null;
	internal_notes: string | null;
	expires_at: string | null;
	sent_at: string | null;
	viewed_at: string | null;
	accepted_at: string | null;
	declined_at: string | null;
	acceptance_signature_name: string | null;
	acceptance_signed_at: string | null;
	created_at: string;
	updated_at: string;
	contact_id: string;
	contact_name: string;
	contact_phone: string;
	contact_email: string | null;
	contact_sms_opt_out: boolean;
	opportunity_id: string | null;
	service_address_id: string | null;
	service_address: QuoteServiceAddress | null;
	view_count: number;
	line_items: QuoteLineItemRow[];
	active_change_request: QuoteChangeRequestSummary | null;
};

export type QuoteTemplateListItem = {
	id: string;
	name: string;
	description: string | null;
	line_item_count: number;
	estimated_subtotal: string;
	created_at: string;
	updated_at: string;
	created_by_name: string | null;
};

export type QuoteTemplateDetail = QuoteTemplateListItem & {
	line_items: QuoteLineItemRow[];
};

export type QuoteTemplateLineDraft = {
	client_id: string;
	description: string;
	details?: string | null;
	quantity: string;
	unit: string;
	// Section/group heading this template line belongs to. Null/undefined = ungrouped.
	section_label?: string | null;
	// Optional add-on flag carried from the template into a new quote.
	is_optional?: boolean;
	unit_price: string;
};

export type PublicQuoteView = {
	quote_number_display: string;
	title: string;
	subtotal: string;
	// Quote-level discount applied before tax. discount_value drives the live percent
	// recompute on the public page; discount_amount is the server-computed base dollars-off.
	discount_type: string;
	discount_value: string | null;
	discount_amount: string | null;
	discount_label: string | null;
	tax_rate: string;
	tax_amount: string;
	total: string;
	deposit_required: boolean;
	deposit_type: string;
	deposit_percent: string | null;
	deposit_amount: string | null;
	deposit_paid_amount: number;
	deposit_paid_at: string | null;
	deposit_payment_available: boolean;
	notes: string | null;
	expires_at: string | null;
	status: QuoteStatus;
	org_name: string;
	org_logo_url: string | null;
	org_primary_color: string | null;
	org_tagline: string | null;
	// Business "Authorized by" signature block (org-level, set once in settings).
	// Only shown when the org enabled it; signature_image_url is a resolved URL.
	signature_block_enabled: boolean;
	signature_name: string | null;
	signature_title: string | null;
	signature_statement: string | null;
	signature_image_url: string | null;
	contact_name: string;
	issued_by_name: string | null;
	service_address: QuoteServiceAddress | null;
	line_items: QuoteLineItemRow[];
};
