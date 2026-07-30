import { randomUUID } from 'crypto';
import type { NewOutboxEvent } from '$lib/server/db/schema';

export function invoiceSentEvent(args: {
	orgId: string;
	invoiceId: string;
	contactId: string;
	hasEmail: boolean;
	totalFormatted: string;
	amountDueFormatted: string;
	invoiceNumberDisplay: string;
	publicToken: string | null;
	paymentLinkUrl: string | null;
	dueDate: string | null;
	// Channels the contractor chose to deliver on. Null = legacy/default (every
	// available channel). The worker still hard-blocks SMS on opt-out.
	channels?: ('email' | 'sms')[] | null;
	// Optional message overrides (merge tokens, interpolated at delivery). Null = default copy.
	smsBody?: string | null;
	emailSubject?: string | null;
	emailBody?: string | null;
}): NewOutboxEvent {
	return {
		org_id: args.orgId,
		event_type: 'invoice.sent',
		resource_type: 'invoice',
		resource_id: args.invoiceId,
		payload: {
			invoice_id: args.invoiceId,
			contact_id: args.contactId,
			has_email: args.hasEmail,
			total_formatted: args.totalFormatted,
			amount_due_formatted: args.amountDueFormatted,
			invoice_number_display: args.invoiceNumberDisplay,
			public_token: args.publicToken,
			payment_link_url: args.paymentLinkUrl,
			due_date: args.dueDate,
			channels: args.channels ?? null,
			sms_body: args.smsBody ?? null,
			email_subject: args.emailSubject ?? null,
			email_body: args.emailBody ?? null
		},
		idempotency_key: `invoice.sent:${args.invoiceId}:${randomUUID()}`
	};
}

// Emitted only for already-sent invoices when the contractor flips the per-invoice
// "Send automatic payment reminders" switch. The automation worker re-enrolls the
// invoice into dunning (enabled) or stops its pending reminders (disabled). Each
// toggle is a distinct event (random idempotency key) — never deduped.
export function invoiceRemindersToggledEvent(args: {
	orgId: string;
	invoiceId: string;
	contactId: string;
	enabled: boolean;
	dueDate: string | null;
}): NewOutboxEvent {
	return {
		org_id: args.orgId,
		event_type: 'invoice.reminders_toggled',
		resource_type: 'invoice',
		resource_id: args.invoiceId,
		payload: {
			invoice_id: args.invoiceId,
			contact_id: args.contactId,
			enabled: args.enabled,
			due_date: args.dueDate
		},
		idempotency_key: `invoice.reminders_toggled:${args.invoiceId}:${randomUUID()}`
	};
}

export function invoiceViewedEvent(args: {
	orgId: string;
	invoiceId: string;
	contactId: string;
	viewId: string;
	ipHash: string;
}): NewOutboxEvent {
	return {
		org_id: args.orgId,
		event_type: 'invoice.viewed',
		resource_type: 'invoice',
		resource_id: args.invoiceId,
		payload: {
			invoice_id: args.invoiceId,
			contact_id: args.contactId,
			view_id: args.viewId,
			ip_hash: args.ipHash,
			notification_sent: false
		},
		idempotency_key: `invoice.viewed:${args.invoiceId}`
	};
}

export function invoicePaidEvent(args: {
	orgId: string;
	invoiceId: string;
	paymentId: string;
	totalFormatted: string;
	invoiceNumberDisplay: string;
}): NewOutboxEvent {
	return {
		org_id: args.orgId,
		event_type: 'invoice.paid',
		resource_type: 'invoice',
		resource_id: args.invoiceId,
		payload: {
			invoice_id: args.invoiceId,
			payment_id: args.paymentId,
			total_formatted: args.totalFormatted,
			invoice_number_display: args.invoiceNumberDisplay
		},
		idempotency_key: `invoice.paid:${args.invoiceId}`
	};
}

// Emitted when the contractor chooses to send a payment receipt to the customer (from the Add
// Payment dialog's "Send receipt" toggle, or the per-row "Send receipt" action). Routed to the
// automation queue's `payment_receipt` handler, which delivers over the chosen channel(s) and
// stamps payments.receipt_sent_at/receipt_sent_via. Each request is its own event (random key) so
// a re-send is never deduped.
export function paymentReceiptRequestedEvent(args: {
	orgId: string;
	invoiceId: string;
	paymentId: string;
	contactId: string;
	amountFormatted: string;
	tipFormatted: string | null;
	methodLabel: string;
	paidAtIso: string;
	invoiceNumberDisplay: string;
	publicToken: string | null;
	channels: ('email' | 'sms')[];
	smsBody?: string | null;
	emailSubject?: string | null;
	emailBody?: string | null;
}): NewOutboxEvent {
	return {
		org_id: args.orgId,
		event_type: 'payment.receipt_requested',
		resource_type: 'invoice',
		resource_id: args.invoiceId,
		payload: {
			invoice_id: args.invoiceId,
			payment_id: args.paymentId,
			contact_id: args.contactId,
			amount_formatted: args.amountFormatted,
			tip_formatted: args.tipFormatted,
			method_label: args.methodLabel,
			paid_at_iso: args.paidAtIso,
			invoice_number_display: args.invoiceNumberDisplay,
			public_token: args.publicToken,
			channels: args.channels,
			sms_body: args.smsBody ?? null,
			email_subject: args.emailSubject ?? null,
			email_body: args.emailBody ?? null
		},
		idempotency_key: `payment.receipt_requested:${args.paymentId}:${randomUUID()}`
	};
}

export function paymentRecordedEvent(args: {
	orgId: string;
	invoiceId: string;
	paymentId: string;
	amountFormatted: string;
	invoiceNumberDisplay: string;
}): NewOutboxEvent {
	return {
		org_id: args.orgId,
		event_type: 'payment.recorded',
		resource_type: 'invoice',
		resource_id: args.invoiceId,
		payload: {
			invoice_id: args.invoiceId,
			payment_id: args.paymentId,
			amount_formatted: args.amountFormatted,
			invoice_number_display: args.invoiceNumberDisplay
		},
		idempotency_key: `payment.recorded:${args.paymentId}`
	};
}

export function paymentUpdatedEvent(args: {
	orgId: string;
	invoiceId: string;
	paymentId: string;
}): NewOutboxEvent {
	return {
		org_id: args.orgId,
		event_type: 'payment.updated',
		resource_type: 'payment',
		resource_id: args.paymentId,
		payload: { invoice_id: args.invoiceId, payment_id: args.paymentId },
		idempotency_key: `payment.updated:${args.paymentId}:${randomUUID()}`
	};
}

export function paymentDeletedEvent(args: {
	orgId: string;
	invoiceId: string;
	paymentId: string;
}): NewOutboxEvent {
	return {
		org_id: args.orgId,
		event_type: 'payment.deleted',
		resource_type: 'payment',
		resource_id: args.paymentId,
		payload: { invoice_id: args.invoiceId, payment_id: args.paymentId },
		idempotency_key: `payment.deleted:${args.paymentId}:${randomUUID()}`
	};
}

export function paymentRefundedEvent(args: {
	orgId: string;
	invoiceId: string;
	paymentId: string;
	originalPaymentId: string;
	amountFormatted: string;
	invoiceNumberDisplay: string;
}): NewOutboxEvent {
	return {
		org_id: args.orgId,
		event_type: 'payment.refunded',
		resource_type: 'payment',
		resource_id: args.paymentId,
		payload: {
			payment_id: args.paymentId,
			original_payment_id: args.originalPaymentId,
			invoice_id: args.invoiceId,
			amount_formatted: args.amountFormatted,
			invoice_number_display: args.invoiceNumberDisplay
		},
		idempotency_key: `payment.refunded:${args.paymentId}`
	};
}

export function paymentReversedEvent(args: {
	orgId: string;
	invoiceId: string;
	paymentId: string;
	originalPaymentId: string;
	amountFormatted: string;
	invoiceNumberDisplay: string;
}): NewOutboxEvent {
	return {
		org_id: args.orgId,
		event_type: 'payment.reversed',
		resource_type: 'payment',
		resource_id: args.paymentId,
		payload: {
			payment_id: args.paymentId,
			original_payment_id: args.originalPaymentId,
			invoice_id: args.invoiceId,
			amount_formatted: args.amountFormatted,
			invoice_number_display: args.invoiceNumberDisplay
		},
		idempotency_key: `payment.reversed:${args.paymentId}`
	};
}
