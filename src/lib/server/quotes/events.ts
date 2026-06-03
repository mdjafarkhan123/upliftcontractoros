import { randomUUID } from 'crypto';
import type { NewOutboxEvent } from '$lib/server/db/schema';

export function quoteSentEvent(args: {
	orgId: string;
	quoteId: string;
	contactId: string;
	isResend: boolean;
	hasEmail: boolean;
	publicToken: string;
	totalFormatted: string;
	quoteNumberDisplay: string;
}): NewOutboxEvent {
	return {
		org_id: args.orgId,
		event_type: 'quote.sent',
		resource_type: 'quote',
		resource_id: args.quoteId,
		payload: {
			quote_id: args.quoteId,
			contact_id: args.contactId,
			is_resend: args.isResend,
			has_email: args.hasEmail,
			public_token: args.publicToken,
			total_formatted: args.totalFormatted,
			quote_number_display: args.quoteNumberDisplay
		},
		idempotency_key: `quote.sent:${args.quoteId}:${randomUUID()}`
	};
}

export function quoteViewedEvent(args: {
	orgId: string;
	quoteId: string;
	viewId: string;
}): NewOutboxEvent {
	return {
		org_id: args.orgId,
		event_type: 'quote.viewed',
		resource_type: 'quote',
		resource_id: args.quoteId,
		payload: { quote_id: args.quoteId, view_id: args.viewId },
		idempotency_key: `quote.viewed:${args.quoteId}`
	};
}

export function quoteAcceptedEvent(args: { orgId: string; quoteId: string }): NewOutboxEvent {
	return {
		org_id: args.orgId,
		event_type: 'quote.accepted',
		resource_type: 'quote',
		resource_id: args.quoteId,
		payload: { quote_id: args.quoteId },
		idempotency_key: `quote.accepted:${args.quoteId}`
	};
}

export function quoteDeclinedEvent(args: { orgId: string; quoteId: string }): NewOutboxEvent {
	return {
		org_id: args.orgId,
		event_type: 'quote.declined',
		resource_type: 'quote',
		resource_id: args.quoteId,
		payload: { quote_id: args.quoteId },
		idempotency_key: `quote.declined:${args.quoteId}`
	};
}

export function quoteDepositPaidEvent(args: {
	orgId: string;
	quoteId: string;
	contactId: string;
	amountFormatted: string;
	quoteNumberDisplay: string;
	stripePaymentIntentId: string;
}): NewOutboxEvent {
	const summary = `Client paid ${args.amountFormatted} deposit for Quote ${args.quoteNumberDisplay}`;
	return {
		org_id: args.orgId,
		event_type: 'quote.deposit_paid',
		resource_type: 'quote',
		resource_id: args.quoteId,
		payload: {
			quote_id: args.quoteId,
			contact_id: args.contactId,
			amount_formatted: args.amountFormatted,
			quote_number_display: args.quoteNumberDisplay,
			stripe_payment_intent_id: args.stripePaymentIntentId,
			summary
		},
		// Keyed per quote: the Stripe PI partial unique index on quotes.deposit_stripe_payment_intent_id
		// already prevents double-collection, so one event per quote is correct.
		idempotency_key: `quote.deposit_paid:${args.quoteId}`
	};
}

export function quoteChangesRequestedEvent(args: {
	orgId: string;
	quoteId: string;
	changeRequestId: string;
	messagePreview: string;
	quoteNumberDisplay: string;
}): NewOutboxEvent {
	const summary = `Quote ${args.quoteNumberDisplay} — ${args.messagePreview}`;
	return {
		org_id: args.orgId,
		event_type: 'quote.changes_requested',
		resource_type: 'quote',
		resource_id: args.quoteId,
		payload: {
			quote_id: args.quoteId,
			change_request_id: args.changeRequestId,
			message_preview: args.messagePreview,
			quote_number_display: args.quoteNumberDisplay,
			summary
		},
		// Keyed per change request so future cycles emit a fresh event.
		idempotency_key: `quote.changes_requested:${args.changeRequestId}`
	};
}
