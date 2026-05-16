import type { RawTimelineRow, TimelineEntry, TimelineRegistryEntry } from '../types';
import { makePreview, synthId } from './_shared';

type NoteRowData = {
	content: string;
	author_id: string | null;
	author_name: string | null;
};

export const noteRegistry: TimelineRegistryEntry = {
	source_table: 'notes',
	kind: '',
	mapper: (row) => {
		const d = row.row_data as NoteRowData;
		const preview = makePreview(d.content);
		const author = d.author_name ?? 'A teammate';
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'note',
			tone: 'neutral',
			description: preview ? `Note by ${author}: ${preview}` : `Note by ${author}`,
			metadata: {
				note_id: row.row_id,
				author_id: d.author_id,
				author_name: d.author_name,
				content: preview
			},
			link: null
		};
	}
};
