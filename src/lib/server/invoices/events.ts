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
	paymentLinkUrl: string | null;
	dueDate: string | null;
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
			payment_link_url: args.paymentLinkUrl,
			due_date: args.dueDate
		},
		idempotency_key: `invoice.sent:${args.invoiceId}:${randomUUID()}`
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
