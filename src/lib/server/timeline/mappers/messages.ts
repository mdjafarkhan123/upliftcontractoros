import type { RawTimelineRow, TimelineEntry, TimelineRegistryEntry } from '../types';
import { makePreview, synthId } from './_shared';

type MessageRowData = {
	body: string | null;
	conversation_id: string;
};

function buildEntry(
	row: RawTimelineRow,
	verb: 'received' | 'sent',
	icon_key: string
): TimelineEntry {
	const d = row.row_data as MessageRowData;
	const preview = makePreview(d.body);
	// Direction is encoded in the text itself ("received" / "sent") for
	// accessibility — never rely on icon colour alone.
	const description = preview ? `SMS ${verb}: "${preview}"` : `SMS ${verb}`;
	return {
		type: row.source_table,
		id: synthId(row.source_table, row.row_id),
		created_at: row.effective_at.toISOString(),
		icon_key,
		tone: 'neutral',
		description,
		metadata: { conversation_id: d.conversation_id, preview, direction: verb },
		link: d.conversation_id ? `/inbox/${d.conversation_id}` : null
	};
}

export const messageInRegistry: TimelineRegistryEntry = {
	source_table: 'messages',
	kind: 'in',
	mapper: (row) => buildEntry(row, 'received', 'message-in')
};

export const messageOutRegistry: TimelineRegistryEntry = {
	source_table: 'messages',
	kind: 'out',
	mapper: (row) => buildEntry(row, 'sent', 'message-out')
};
