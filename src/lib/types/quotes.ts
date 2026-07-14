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
	// Per-line tax flag, frozen. Absent on older snapshots (treat as taxable).
	taxable?: boolean;
	// Good-Better-Best: the tier name this line belonged to at snapshot time. Null on a simple
	// quote or an older snapshot taken before packages existed.
	package_name?: string | null;
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
// 'deleted' is the recycle-bin tab (deleted=1) — not a real quote status.
export type QuotesStatusChip = 'all' | 'deleted' | QuoteStatus;

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
	// Advanced filter (QuoteFilterControl). All optional/additive — absent = no narrowing.
	// Salesperson = quotes.issued_by (the team member who owns the quote).
	issuedBy?: string | null;
	// Created-date range (inclusive), yyyy-mm-dd. Empty/null = open-ended.
	dateFrom?: string | null;
	dateTo?: string | null;
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
	// Set only in the recycle-bin view (deleted=1); null on active rows.
	deleted_at: string | null;
};

// A photo attached to a single quote line item, with short-lived signed URLs.
// thumb_url drives the inline thumbnail; full_url is the high-res lightbox image.
export type QuoteLinePhoto = {
	id: string;
	thumb_url: string;
	full_url: string;
};

// A Good-Better-Best package (tier) on a quote, as served to the browser. Empty list on a
// simple quote. subtotal/total are the tier's own denormalized base figures.
export type QuotePackageRow = {
	id: string;
	package_key: string;
	name: string;
	is_recommended: boolean;
	position: number;
	subtotal: string;
	total: string;
};

// Editor-side draft of a package tier. client_id keys Svelte's #each; package_key is the
// stable identity persisted to quote_packages.package_key that lines reference. `lines` holds
// this tier's own line drafts — the builder binds each package's LineItemEditor to it.
export type QuotePackageDraft = {
	client_id: string;
	package_key: string;
	name: string;
	is_recommended: boolean;
	lines: QuoteLineDraft[];
};

export type QuoteLineItemRow = {
	id: string;
	// Stable per-line identity that survives the save's wipe-and-reinsert. Photos bind to it.
	// Optional because template line items have no line_key column.
	line_key?: string;
	// Good-Better-Best: the package this line belongs to (null/absent on a simple quote).
	package_id?: string | null;
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
	// Per-line tax flag. Only taxable lines feed the tax base. Absent = taxable.
	taxable?: boolean;
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
	// Good-Better-Best: the package (tier) this draft line belongs to, referenced by the
	// package's stable package_key. Undefined/null on a simple quote.
	package_key?: string | null;
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
	// Per-line tax flag. Defaults true (taxable); prefilled from the catalog item's
	// default_taxable when added from the price book.
	taxable?: boolean;
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
	// Default per-line tax flag applied when this item is added to a quote/invoice line.
	default_taxable: boolean;
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
	// Customer-facing Terms & Conditions for this quote (snapshot of org default at create).
	terms: string | null;
	expires_at: string | null;
	sent_at: string | null;
	viewed_at: string | null;
	accepted_at: string | null;
	declined_at: string | null;
	acceptance_signature_name: string | null;
	acceptance_signed_at: string | null;
	// In-person "sign on this device": the media id of the customer's drawn signature image.
	// Null on online / offline-marked acceptances. Its presence marks a "Signed in person" quote.
	acceptance_signature_media_id: string | null;
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
	// Good-Better-Best tiers. Empty on a simple quote; 2–3 entries on a tiered quote.
	packages: QuotePackageRow[];
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
	// Per-line tax flag carried from the template into a new quote. Defaults true.
	taxable?: boolean;
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
	terms: string | null;
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
	// Good-Better-Best tiers. Empty on a simple quote; 2–3 entries on a tiered quote. When
	// non-empty each line's package_id says which tier it belongs to, and the customer picks
	// exactly one tier before accepting.
	packages: QuotePackageRow[];
	// Set once the quote is accepted: the tier the customer chose + its frozen final total.
	// Null on a simple quote or a tiered quote not yet accepted.
	accepted_package_id: string | null;
	accepted_total: string | null;
	line_items: QuoteLineItemRow[];
};
