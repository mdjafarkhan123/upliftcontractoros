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

export function quoteAcceptedEvent(args: {
	orgId: string;
	quoteId: string;
}): NewOutboxEvent {
	return {
		org_id: args.orgId,
		event_type: 'quote.accepted',
		resource_type: 'quote',
		resource_id: args.quoteId,
		payload: { quote_id: args.quoteId },
		idempotency_key: `quote.accepted:${args.quoteId}`
	};
}

export function quoteDeclinedEvent(args: {
	orgId: string;
	quoteId: string;
}): NewOutboxEvent {
	return {
		org_id: args.orgId,
		event_type: 'quote.declined',
		resource_type: 'quote',
		resource_id: args.quoteId,
		payload: { quote_id: args.quoteId },
		idempotency_key: `quote.declined:${args.quoteId}`
	};
}
