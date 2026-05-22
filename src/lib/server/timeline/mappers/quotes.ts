import type { RawTimelineRow, TimelineEntry, TimelineRegistryEntry } from '../types';
import { fmtMoney, fmtQuoteNumber, makePreview, synthId } from './_shared';

type QuoteRowData = {
	quote_number: number;
	total: string | null;
	quote_id: string;
};

function makeMapper(
	verb: 'sent' | 'viewed' | 'accepted' | 'declined',
	icon_key: string,
	tone: TimelineEntry['tone'],
	withTotal: boolean
): (row: RawTimelineRow) => TimelineEntry {
	return (row) => {
		const d = row.row_data as QuoteRowData;
		const num = fmtQuoteNumber(d.quote_number);
		const description = withTotal
			? `Quote ${num} ${verb} — ${fmtMoney(d.total)}`
			: `Quote ${num} ${verb}`;
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key,
			tone,
			description,
			metadata: { quote_number: d.quote_number, total: d.total, quote_id: d.quote_id, kind: verb },
			link: `/quotes/${d.quote_id}`
		};
	};
}

export const quoteSentRegistry: TimelineRegistryEntry = {
	source_table: 'quotes',
	kind: 'sent',
	mapper: makeMapper('sent', 'quote-sent', 'neutral', true)
};

export const quoteViewedRegistry: TimelineRegistryEntry = {
	source_table: 'quotes',
	kind: 'viewed',
	mapper: makeMapper('viewed', 'quote-viewed', 'neutral', false)
};

export const quoteAcceptedRegistry: TimelineRegistryEntry = {
	source_table: 'quotes',
	kind: 'accepted',
	mapper: makeMapper('accepted', 'quote-accepted', 'positive', true)
};

export const quoteDeclinedRegistry: TimelineRegistryEntry = {
	source_table: 'quotes',
	kind: 'declined',
	mapper: makeMapper('declined', 'quote-declined', 'attention', false)
};

type QuoteChangeRequestRowData = {
	quote_number: number;
	quote_id: string;
	message: string | null;
};

export const quoteChangesRequestedRegistry: TimelineRegistryEntry = {
	source_table: 'quote_change_requests',
	kind: 'requested',
	mapper: (row: RawTimelineRow): TimelineEntry => {
		const d = row.row_data as QuoteChangeRequestRowData;
		const num = fmtQuoteNumber(d.quote_number);
		const preview = makePreview(d.message);
		const description = preview
			? `Quote ${num} — client requested changes: "${preview}"`
			: `Quote ${num} — client requested changes`;
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'quote-changes-requested',
			tone: 'attention',
			description,
			metadata: { quote_number: d.quote_number, quote_id: d.quote_id, kind: 'requested' },
			link: `/quotes/${d.quote_id}`
		};
	}
};
