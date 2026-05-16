import type { RawTimelineRow, TimelineEntry, TimelineRegistryEntry } from '../types';
import { synthId } from './_shared';

type ReviewRowData = {
	score: number;
	platform: string | null;
	job_id: string | null;
};

export const reviewRegistry: TimelineRegistryEntry = {
	source_table: 'reviews',
	kind: '',
	mapper: (row) => {
		const d = row.row_data as ReviewRowData;
		const platformSuffix = d.platform ? ` on ${d.platform}` : '';
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'review',
			tone: 'positive',
			description: `${d.score}-star review received${platformSuffix}`,
			metadata: { score: d.score, platform: d.platform, job_id: d.job_id },
			link: d.job_id ? `/jobs/${d.job_id}` : null
		};
	}
};
