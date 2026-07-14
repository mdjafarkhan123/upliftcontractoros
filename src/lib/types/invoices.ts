export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';

export type PaymentMethod = 'stripe' | 'cash' | 'check' | 'bank_transfer' | 'other';

export type InvoicesGroup = 'all' | 'open' | 'closed';
export type InvoicesStatusChip = 'all' | InvoiceStatus;

export type InvoicesFilters = {
	group: InvoicesGroup;
	status: InvoicesStatusChip;
	search: string;
};

// Org-wide invoice AR summary shown above the invoices list (the receivables
// row every accounting-grade CRM opens with: QuickBooks, Jobber, Housecall Pro).
// All figures are org-scoped and independent of the active list filter.
export type InvoiceStats = {
	// Unpaid balance across sent / partially_paid / overdue invoices (drafts excluded).
	outstanding_total: string;
	// Balance + count of effectively-overdue invoices (past due date with a balance).
	overdue_total: string;
	overdue_count: number;
	// Cash actually collected this calendar month (sum of payments, so partials count).
	paid_this_month: string;
	// Average days from sent → paid over the last 90 days. Null when nothing paid.
	avg_days_to_pay: number | null;
};

export type InvoiceListItem = {
	id: string;
	invoice_number: number;
	invoice_number_display: string;
	title: string;
	status: InvoiceStatus;
	total: string;
	amount_paid: string;
	amount_due: string;
	due_date: string | null;
	contact_id: string;
	contact_name: string;
	sent_at: string | null;
	paid_at: string | null;
	created_at: string;
};

export type InvoiceLineItemRow = {
	id: string;
	description: string;
	quantity: string;
	// Optional unit of measure label (e.g. 'sq ft', 'hour'). Null when none.
	unit: string | null;
	unit_price: string;
	// Per-line tax flag. Only taxable lines feed the invoice's tax base. Absent = taxable.
	taxable?: boolean;
	// Cost snapshot + catalog link. Cost is internal-only (feeds the private margin panel).
	unit_cost?: string | null;
	source_catalog_item_id?: string | null;
	total: string;
	// Synthetic late-fee charge line (M8). Hidden from the line-item list; shown as a totals row.
	is_late_fee?: boolean;
	position: number;
};

export type InvoiceLineDraft = {
	client_id: string;
	description: string;
	quantity: string;
	unit_price: string;
	// Per-line tax flag. Defaults true (taxable).
	taxable?: boolean;
};

export type InvoicePaymentRow = {
	id: string;
	amount: string;
	// Tip (gratuity) portion of this payment (M7). '0' when none. Shown beside the amount.
	tip_amount: string;
	payment_method: PaymentMethod;
	stripe_payment_intent_id: string | null;
	notes: string | null;
	recorded_by_name: string | null;
	paid_at: string;
	created_at: string;
};

export type InvoiceDetail = {
	id: string;
	invoice_number: number;
	invoice_number_display: string;
	title: string;
	status: InvoiceStatus;
	subtotal: string;
	// Invoice-level discount applied before tax (mirrors quotes). type 'none' = no discount.
	discount_type: string;
	discount_value: string | null;
	discount_amount: string | null;
	discount_label: string | null;
	tax_rate: string;
	tax_amount: string;
	total: string;
	amount_paid: string;
	amount_due: string;
	// Running total of tips collected across this invoice's payments (M7). Extra money, never
	// part of Total/Balance. '0' when none.
	tip_total: string;
	// Late fee charged on this invoice (M8). Unlike tips, this IS part of Total/Balance — added
	// after tax as its own row. '0' when no fee has been applied.
	late_fee_total: string;
	// Per-invoice late-fee terms (M8 Phase 2), snapshot from the org default at create, editable
	// via /late-fee-config. Effective gate = org.late_fee_enabled AND late_fee_enabled. type is
	// 'flat' | 'percent'; value is the flat $ or the percent for whichever type is active.
	late_fee_enabled: boolean;
	late_fee_type: string | null;
	late_fee_value: string | null;
	notes: string | null;
	// Customer-facing Terms & Conditions block (mirrors quotes.terms). Null = none.
	terms: string | null;
	due_date: string | null;
	// Per-invoice automatic-reminders switch (default true). Toggled via the /reminders endpoint.
	send_payment_reminders: boolean;
	// Per-invoice accept-tips switch (default true). Toggled via the /tips endpoint. Effective
	// tip acceptance = org.tips_enabled AND this flag.
	accept_tips: boolean;
	stripe_payment_link_url: string | null;
	sent_at: string | null;
	paid_at: string | null;
	created_at: string;
	updated_at: string;
	contact_id: string;
	contact_name: string;
	contact_phone: string;
	contact_email: string | null;
	contact_sms_opt_out: boolean;
	job_id: string | null;
	opportunity_id: string | null;
	quote_id: string | null;
	line_items: InvoiceLineItemRow[];
	payments: InvoicePaymentRow[];
};
