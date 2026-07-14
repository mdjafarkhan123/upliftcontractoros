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
