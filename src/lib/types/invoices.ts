export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';

export type PaymentMethod = 'stripe' | 'cash' | 'check' | 'bank_transfer' | 'other';

export type InvoicesGroup = 'all' | 'open' | 'closed';
export type InvoicesStatusChip = 'all' | InvoiceStatus;

export type InvoicesFilters = {
	group: InvoicesGroup;
	status: InvoicesStatusChip;
	search: string;
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
	unit_price: string;
	total: string;
	position: number;
};

export type InvoiceLineDraft = {
	client_id: string;
	description: string;
	quantity: string;
	unit_price: string;
};

export type InvoicePaymentRow = {
	id: string;
	amount: string;
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
	tax_rate: string;
	tax_amount: string;
	total: string;
	amount_paid: string;
	amount_due: string;
	notes: string | null;
	due_date: string | null;
	stripe_payment_link_url: string | null;
	sent_at: string | null;
	paid_at: string | null;
	created_at: string;
	updated_at: string;
	contact_id: string;
	contact_name: string;
	contact_phone: string;
	contact_email: string | null;
	job_id: string | null;
	opportunity_id: string | null;
	quote_id: string | null;
	line_items: InvoiceLineItemRow[];
	payments: InvoicePaymentRow[];
};
