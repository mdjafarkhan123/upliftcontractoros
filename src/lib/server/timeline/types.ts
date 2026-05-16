/**
 * Shared types for the contact activity timeline.
 *
 * The timeline normalizes 11+ heterogeneous source tables into a single
 * presentation shape. The server is the sole authority for icon, tone,
 * description text, and navigation link — the client only renders.
 *
 * See CLAUDE.md + skills/contractor-crm/references/event-flows.md (Section 3).
 */

export type TimelineTone = 'neutral' | 'positive' | 'attention' | 'negative';

export type TimelineEntry = {
	type: string;
	id: string;
	created_at: string;
	icon_key: string;
	tone: TimelineTone;
	description: string;
	metadata?: Record<string, unknown>;
	link?: string | null;
};

/**
 * A raw row produced by a union branch in buildQuery.ts.
 *
 * `source_table` is a stable bucket identifier — `quotes`, `messages`,
 * `invoices`, etc. — and is part of the public cursor contract; values
 * here must never be renamed once shipped.
 *
 * `row_data.kind` carries the lifecycle event sub-type (e.g. quotes can
 * emit sent / viewed / accepted / declined for a single quote row, each
 * with its own effective timestamp). Multi-kind buckets disambiguate via
 * a `:{kind}` suffix on `row_id` so the compound cursor stays unique.
 */
export type RawTimelineRow = {
	source_table: string;
	row_id: string;
	effective_at: Date;
	row_data: Record<string, unknown> & { kind?: string };
};

export type TimelineMapper = (row: RawTimelineRow) => TimelineEntry;

export type TimelineRegistryEntry = {
	source_table: string;
	/** Sub-type within the bucket; '' for buckets with a single kind. */
	kind: string;
	mapper: TimelineMapper;
	/**
	 * Optional weighting for future relevance/sorting systems.
	 * Not used in v1 ordering — kept for forward compatibility.
	 */
	priority?: number;
};

export type TimelineCursor = {
	effective_at: string;
	source_table: string;
	row_id: string;
};

export function encodeCursor(c: TimelineCursor): string {
	return `${c.effective_at}|${c.source_table}|${c.row_id}`;
}

export function decodeCursor(raw: string): TimelineCursor | null {
	const parts = raw.split('|');
	if (parts.length !== 3) return null;
	const [effective_at, source_table, row_id] = parts;
	if (!effective_at || !source_table || !row_id) return null;
	return { effective_at, source_table, row_id };
}
