import type { RawTimelineRow, TimelineEntry, TimelineRegistryEntry } from '../types';
import { synthId } from './_shared';

type FeedbackRowData = {
	score: number;
	job_id: string | null;
};

export const privateFeedbackRegistry: TimelineRegistryEntry = {
	source_table: 'private_feedback',
	kind: '',
	mapper: (row) => {
		const d = row.row_data as FeedbackRowData;
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'feedback',
			tone: 'negative',
			description: `Private feedback received — ${d.score}/5`,
			metadata: { score: d.score, job_id: d.job_id },
			link: d.job_id ? `/jobs/${d.job_id}` : null
		};
	}
};
