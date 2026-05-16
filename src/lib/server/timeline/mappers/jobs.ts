import type { RawTimelineRow, TimelineEntry, TimelineRegistryEntry } from '../types';
import { synthId } from './_shared';

type JobRowData = {
	title: string;
	job_id: string;
};

function trimTitle(title: string, max: number): string {
	if (title.length <= max) return title;
	return title.slice(0, max - 1).trimEnd() + '…';
}

export const jobCreatedRegistry: TimelineRegistryEntry = {
	source_table: 'jobs',
	kind: 'created',
	mapper: (row) => {
		const d = row.row_data as JobRowData;
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'job-created',
			tone: 'positive',
			description: `Job created — ${trimTitle(d.title, 100)}`,
			metadata: { title: d.title, kind: 'created' },
			link: `/jobs/${d.job_id}`
		};
	}
};

export const jobCompletedRegistry: TimelineRegistryEntry = {
	source_table: 'jobs',
	kind: 'completed',
	mapper: (row) => {
		const d = row.row_data as JobRowData;
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'job-completed',
			tone: 'positive',
			description: `Job completed — ${trimTitle(d.title, 100)}`,
			metadata: { title: d.title, kind: 'completed' },
			link: `/jobs/${d.job_id}`
		};
	}
};

export const jobCancelledRegistry: TimelineRegistryEntry = {
	source_table: 'jobs',
	kind: 'cancelled',
	mapper: (row) => {
		const d = row.row_data as JobRowData;
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'job-cancelled',
			tone: 'attention',
			description: `Job cancelled — ${trimTitle(d.title, 100)}`,
			metadata: { title: d.title, kind: 'cancelled' },
			link: `/jobs/${d.job_id}`
		};
	}
};
