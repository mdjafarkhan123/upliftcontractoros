import type { RawTimelineRow, TimelineEntry, TimelineRegistryEntry } from '../types';
import { fmtApptWhen, synthId } from './_shared';

type ApptRowData = {
	title: string;
	scheduled_start: string | null;
	appointment_id: string;
};

function trimTitle(title: string, max: number): string {
	if (title.length <= max) return title;
	return title.slice(0, max - 1).trimEnd() + '…';
}

export const appointmentScheduledRegistry: TimelineRegistryEntry = {
	source_table: 'appointments',
	kind: 'scheduled',
	mapper: (row) => {
		const d = row.row_data as ApptRowData;
		const when = fmtApptWhen(d.scheduled_start);
		const title = trimTitle(d.title, 60);
		const description = when
			? `Appointment scheduled — ${title} (${when})`
			: `Appointment scheduled — ${title}`;
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'appointment',
			tone: 'neutral',
			description,
			metadata: { title: d.title, scheduled_start: d.scheduled_start, kind: 'scheduled' },
			link: `/appointments/${d.appointment_id}`
		};
	}
};

export const appointmentCompletedRegistry: TimelineRegistryEntry = {
	source_table: 'appointments',
	kind: 'completed',
	mapper: (row) => {
		const d = row.row_data as ApptRowData;
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'appointment-completed',
			tone: 'positive',
			description: `Appointment completed — ${trimTitle(d.title, 90)}`,
			metadata: { title: d.title, kind: 'completed' },
			link: `/appointments/${d.appointment_id}`
		};
	}
};

export const appointmentCancelledRegistry: TimelineRegistryEntry = {
	source_table: 'appointments',
	kind: 'cancelled',
	mapper: (row) => {
		const d = row.row_data as ApptRowData;
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'appointment-cancelled',
			tone: 'attention',
			description: `Appointment cancelled — ${trimTitle(d.title, 90)}`,
			metadata: { title: d.title, kind: 'cancelled' },
			link: `/appointments/${d.appointment_id}`
		};
	}
};
