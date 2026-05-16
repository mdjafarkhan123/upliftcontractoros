import type { RawTimelineRow, TimelineEntry, TimelineRegistryEntry } from '../types';
import { synthId } from './_shared';

type AutomationRowData = {
	resource_type: string | null;
	resource_id: string | null;
};

/**
 * Customer-visible automations only. Retry attempts, worker failures,
 * dead-letter events, and queue internals are not exposed (rule 14).
 *
 * Note: automated review-request automation_jobs rows would duplicate the
 * dedicated review_requests timeline entry, so the review_request
 * automation type is intentionally omitted from this registry.
 */

export const automationMissedCallRegistry: TimelineRegistryEntry = {
	source_table: 'automations',
	kind: 'missed_call_textback',
	mapper: (row) => {
		const d = row.row_data as AutomationRowData;
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'automation-missed-call',
			tone: 'neutral',
			description: 'Missed-call text-back sent',
			metadata: {
				resource_type: d.resource_type,
				resource_id: d.resource_id,
				kind: 'missed_call_textback'
			},
			link: null
		};
	}
};

export const automationQuoteFollowupRegistry: TimelineRegistryEntry = {
	source_table: 'automations',
	kind: 'quote_followup',
	mapper: (row) => {
		const d = row.row_data as AutomationRowData;
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'automation-quote-followup',
			tone: 'neutral',
			description: 'Quote follow-up sent',
			metadata: {
				resource_type: d.resource_type,
				resource_id: d.resource_id,
				kind: 'quote_followup'
			},
			link: d.resource_id ? `/quotes/${d.resource_id}` : null
		};
	}
};

export const automationInvoiceReminderRegistry: TimelineRegistryEntry = {
	source_table: 'automations',
	kind: 'invoice_reminder',
	mapper: (row) => {
		const d = row.row_data as AutomationRowData;
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'automation-invoice-reminder',
			tone: 'neutral',
			description: 'Invoice reminder sent',
			metadata: {
				resource_type: d.resource_type,
				resource_id: d.resource_id,
				kind: 'invoice_reminder'
			},
			link: d.resource_id ? `/invoices/${d.resource_id}` : null
		};
	}
};
