import type { RawTimelineRow, TimelineEntry, TimelineRegistryEntry } from './types';
import { messageInRegistry, messageOutRegistry } from './mappers/messages';
import {
	quoteAcceptedRegistry,
	quoteDeclinedRegistry,
	quoteSentRegistry,
	quoteViewedRegistry
} from './mappers/quotes';
import { invoicePaidRegistry, invoiceSentRegistry } from './mappers/invoices';
import { paymentRegistry } from './mappers/payments';
import {
	appointmentCancelledRegistry,
	appointmentCompletedRegistry,
	appointmentScheduledRegistry
} from './mappers/appointments';
import {
	jobCancelledRegistry,
	jobCompletedRegistry,
	jobCreatedRegistry
} from './mappers/jobs';
import { reviewRequestSentRegistry } from './mappers/review_requests';
import { reviewRegistry } from './mappers/reviews';
import { privateFeedbackRegistry } from './mappers/private_feedback';
import { noteRegistry } from './mappers/contact_notes';
import {
	automationInvoiceReminderRegistry,
	automationMissedCallRegistry,
	automationQuoteFollowupRegistry
} from './mappers/automation_jobs';

/**
 * Authoritative list of every timeline source. Each branch must:
 *   - filter by org_id and contact_id
 *   - filter deleted_at IS NULL where applicable
 *   - select ONLY the columns its mapper needs
 *   - emit a row per discrete event timestamp (immutable history)
 */
export const TIMELINE_REGISTRY: TimelineRegistryEntry[] = [
	messageInRegistry,
	messageOutRegistry,
	quoteSentRegistry,
	quoteViewedRegistry,
	quoteAcceptedRegistry,
	quoteDeclinedRegistry,
	invoiceSentRegistry,
	invoicePaidRegistry,
	paymentRegistry,
	appointmentScheduledRegistry,
	appointmentCompletedRegistry,
	appointmentCancelledRegistry,
	jobCreatedRegistry,
	jobCompletedRegistry,
	jobCancelledRegistry,
	reviewRequestSentRegistry,
	reviewRegistry,
	privateFeedbackRegistry,
	noteRegistry,
	automationMissedCallRegistry,
	automationQuoteFollowupRegistry,
	automationInvoiceReminderRegistry
];

function lookupKey(source_table: string, kind: string): string {
	return `${source_table}:${kind}`;
}

const BY_SOURCE_AND_KIND = new Map<string, TimelineRegistryEntry>(
	TIMELINE_REGISTRY.map((r) => [lookupKey(r.source_table, r.kind), r])
);

/**
 * Stable source_table bucket identifiers — part of the public cursor contract.
 * Adding new buckets is safe; renaming or removing them is a breaking change.
 */
export const TIMELINE_SOURCE_TABLES = [
	'messages',
	'quotes',
	'invoices',
	'payments',
	'appointments',
	'jobs',
	'review_requests',
	'reviews',
	'private_feedback',
	'notes',
	'automations'
] as const;

export function mapRowToEntry(row: RawTimelineRow): TimelineEntry | null {
	const kind = typeof row.row_data.kind === 'string' ? row.row_data.kind : '';
	const entry = BY_SOURCE_AND_KIND.get(lookupKey(row.source_table, kind));
	if (!entry) return null;
	try {
		return entry.mapper(row);
	} catch {
		return null;
	}
}
