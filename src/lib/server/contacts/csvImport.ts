// Shared CSV parsing + header mapping for the background contact-import pipeline.
// Used both by the upload route (POST /api/contacts/import — validate header,
// count rows) and by contactImportWorker (3.c — parse + transform each row).
// Keep all CSV-shape knowledge here so the route and worker never drift.

// Handles quoted fields (including embedded commas) and escaped double-quotes.
// Strips the UTF-8 BOM that Excel prepends, which would otherwise corrupt the
// first header cell ("﻿Full Name").
export function parseCSV(text: string): string[][] {
	text = text.replace(/^﻿/, '');
	const result: string[][] = [];
	const lines = text.split(/\r?\n/);
	for (const line of lines) {
		if (!line.trim()) continue;
		const fields: string[] = [];
		let cur = '';
		let inQuotes = false;
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (ch === '"') {
				if (inQuotes && line[i + 1] === '"') {
					cur += '"';
					i++;
				} else {
					inQuotes = !inQuotes;
				}
			} else if (ch === ',' && !inQuotes) {
				fields.push(cur.trim());
				cur = '';
			} else {
				cur += ch;
			}
		}
		fields.push(cur.trim());
		result.push(fields);
	}
	return result;
}

// Header vocabulary now lives in a client-safe shared module so the import modal
// can share it (it's under $lib/server, which .svelte files can't import). Re-export
// keeps every existing `from '.../csvImport'` import of these working unchanged.
import { normalizeKey, HEADER_MAP } from '$lib/contacts/csvHeaders';
export { normalizeKey, HEADER_MAP };

/**
 * Resolve a contact's display name from a row: prefer a single name column, else
 * stitch first + last. Returns '' when nothing usable is present.
 */
export function resolveFullName(row: string[], fieldIndex: Record<string, number>): string {
	const at = (field: string) => {
		const idx = fieldIndex[field];
		return idx !== undefined ? (row[idx] ?? '').trim() : '';
	};
	const full = at('full_name');
	if (full) return full;
	return [at('first_name'), at('last_name')].filter(Boolean).join(' ').trim();
}

/**
 * Map a normalized header row to canonical-field → column-index. First column
 * wins for a given canonical field (so `phone` beats a later `mobile` alias).
 */
export function buildFieldIndex(headerRow: string[]): Record<string, number> {
	const fieldIndex: Record<string, number> = {};
	for (let i = 0; i < headerRow.length; i++) {
		const canonical = HEADER_MAP[headerRow[i]];
		if (canonical && !(canonical in fieldIndex)) {
			fieldIndex[canonical] = i;
		}
	}
	return fieldIndex;
}

/**
 * Build the same canonical-field → column-index map from the user's EXPLICIT column
 * mapping (the "Map columns" step), instead of auto-guessing headers. The map is an
 * array aligned by column index: each entry is the canonical field that column feeds
 * (e.g. 'phone') or null/'' for "don't import". First column wins on any duplicate,
 * matching buildFieldIndex's behavior.
 */
export function buildFieldIndexFromMap(columnMap: (string | null)[]): Record<string, number> {
	const fieldIndex: Record<string, number> = {};
	for (let i = 0; i < columnMap.length; i++) {
		const canonical = columnMap[i];
		if (canonical && !(canonical in fieldIndex)) {
			fieldIndex[canonical] = i;
		}
	}
	return fieldIndex;
}

export type CsvAnalysis = { ok: true; dataRowCount: number } | { ok: false; error: string };

/**
 * Validate the uploaded CSV at upload time (before queuing the job): it must
 * have a header, at least one data row, and a name column. Returns the data-row
 * count so the route can store total_rows. The worker re-parses from R2 — this
 * is only an early-reject for a confusing/empty file.
 */
export function analyzeCsv(text: string, columnMap?: (string | null)[] | null): CsvAnalysis {
	const allRows = parseCSV(text);
	if (allRows.length < 2) {
		return { ok: false, error: 'CSV has no data rows.' };
	}
	// When the user mapped columns explicitly, validate against THAT map; otherwise
	// fall back to auto-detecting the header row.
	const fieldIndex =
		columnMap && columnMap.length > 0
			? buildFieldIndexFromMap(columnMap)
			: buildFieldIndex(allRows[0].map(normalizeKey));
	const hasName = 'full_name' in fieldIndex || 'first_name' in fieldIndex;
	if (!hasName) {
		return {
			ok: false,
			error: 'A Name column must be mapped (or First name / Last name).'
		};
	}
	return { ok: true, dataRowCount: allRows.length - 1 };
}
