import type {
	InvoiceStatus,
	ManualPaymentMethod,
	PaymentAdjustmentType,
	PaymentMethod
} from '$lib/types/invoices';

// Single source of truth for how a payment method is labeled in the UI (the Payments table,
// the Add/Edit dialog dropdown, receipts). Covers 'stripe' (online capture) for display even
// though it's never a manual pick.
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
	stripe: 'Card (online)',
	other: 'Other',
	bank_transfer: 'Bank transfer',
	cash: 'Cash',
	check: 'Check',
	credit_card: 'Credit/debit card',
	paypal: 'PayPal'
};

// The manual payment-type dropdown options, in Jobber's order (ref/invoice/4.jpg): Other,
// Bank transfer, Cash, Check, Credit/debit card, PayPal. 'stripe' is excluded — it's only ever
// set by the online capture path, never chosen by hand.
export const MANUAL_PAYMENT_METHODS: { value: ManualPaymentMethod; label: string }[] = [
	{ value: 'other', label: PAYMENT_METHOD_LABELS.other },
	{ value: 'bank_transfer', label: PAYMENT_METHOD_LABELS.bank_transfer },
	{ value: 'cash', label: PAYMENT_METHOD_LABELS.cash },
	{ value: 'check', label: PAYMENT_METHOD_LABELS.check },
	{ value: 'credit_card', label: PAYMENT_METHOD_LABELS.credit_card },
	{ value: 'paypal', label: PAYMENT_METHOD_LABELS.paypal }
];

export const PAYMENT_ADJUSTMENT_LABELS: Record<PaymentAdjustmentType, string> = {
	payment: 'Payment',
	refund: 'Refund',
	correction: 'Correction',
	failed_payment: 'Failed payment',
	bad_debt: 'Bad debt',
	void: 'Void'
};

export const PAYMENT_REVERSAL_TYPES: {
	value: Exclude<PaymentAdjustmentType, 'payment' | 'bad_debt'>;
	label: string;
}[] = [
	{ value: 'correction', label: PAYMENT_ADJUSTMENT_LABELS.correction },
	{ value: 'refund', label: PAYMENT_ADJUSTMENT_LABELS.refund },
	{ value: 'failed_payment', label: PAYMENT_ADJUSTMENT_LABELS.failed_payment },
	{ value: 'void', label: PAYMENT_ADJUSTMENT_LABELS.void }
];

/**
 * Effective-overdue: true when the invoice is past its due date with a
 * remaining balance, regardless of whether the nightly cron has yet
 * flipped its status to 'past_due'. Use this for UI badges and visual
 * cues so contractors see overdue invoices immediately.
 */
export function isEffectivelyOverdue(
	status: InvoiceStatus,
	dueDate: string | null,
	amountDue: string | number
): boolean {
	if (status === 'past_due') return true;
	if (status !== 'sent_not_due' && status !== 'awaiting_payment') return false;
	if (!dueDate) return false;
	if (Number(amountDue) <= 0) return false;

	const due = new Date(dueDate);
	if (Number.isNaN(due.getTime())) return false;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	due.setHours(0, 0, 0, 0);
	return due < today;
}
