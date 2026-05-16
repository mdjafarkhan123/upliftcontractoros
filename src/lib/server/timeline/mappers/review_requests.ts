import type { RawTimelineRow, TimelineEntry, TimelineRegistryEntry } from '../types';
import { synthId } from './_shared';

type ReviewReqRowData = {
	job_id: string | null;
};

export const reviewRequestSentRegistry: TimelineRegistryEntry = {
	source_table: 'review_requests',
	kind: 'sent',
	mapper: (row) => {
		const d = row.row_data as ReviewReqRowData;
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'review-request',
			tone: 'neutral',
			description: 'Review request sent',
			metadata: { job_id: d.job_id },
			link: d.job_id ? `/jobs/${d.job_id}` : null
		};
	}
};
