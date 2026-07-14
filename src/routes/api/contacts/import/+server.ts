import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contactImports } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { analyzeCsv } from '$lib/server/contacts/csvImport';
import { CANONICAL_FIELD_SET } from '$lib/contacts/csvHeaders';
import { r2Upload } from '$lib/server/media/r2';
import {
	addJob,
	contactImportQueue,
	CONTACT_IMPORT_JOB
} from '$lib/server/queue/bullmq';

const MAX_ROWS = 10_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_COLUMNS = 200;

// The explicit column mapping from the "Map columns" step: one entry per CSV column
// (aligned by index), each a canonical field name or null/'' for "don't import".
const columnMapSchema = z
	.array(z.string().nullable())
	.max(MAX_COLUMNS)
	.transform((arr) => arr.map((v) => (v && v.trim() ? v.trim() : null)))
	.refine((arr) => arr.every((v) => v === null || CANONICAL_FIELD_SET.has(v)), {
		message: 'Column mapping references an unknown field.'
	});

// Background import: the request only validates + stores the raw CSV and queues
// a job. The contactImportWorker (standalone) parses, normalizes, and inserts
// rows in batches, updating the contact_imports row as it goes. The UI tracks
// progress via Supabase Realtime on that row.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_create_contacts) error(403, 'Forbidden');

	let formData: FormData;
	try {
		formData = await event.request.formData();
	} catch {
		return json({ error: 'Invalid form data' }, { status: 400 });
	}

	const file = formData.get('file');
	if (!(file instanceof File)) {
		return json({ error: 'No CSV file provided' }, { status: 400 });
	}

	// How to treat rows that match an existing contact (by phone OR email). Anything
	// other than the explicit 'update' opt-in falls back to the safe 'skip' default.
	const onDuplicate = formData.get('on_duplicate') === 'update' ? 'update' : 'skip';
	if (file.size > MAX_FILE_BYTES) {
		return json({ error: 'File too large. Maximum 10 MB.' }, { status: 400 });
	}

	// Optional explicit column mapping from the "Map columns" step. When absent the
	// worker falls back to auto-detecting headers via HEADER_MAP.
	let columnMap: (string | null)[] | null = null;
	const columnMapRaw = formData.get('column_map');
	if (typeof columnMapRaw === 'string' && columnMapRaw.trim()) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(columnMapRaw);
		} catch {
			return json({ error: 'Invalid column mapping.' }, { status: 400 });
		}
		const result = columnMapSchema.safeParse(parsed);
		if (!result.success) {
			return json({ error: result.error.issues[0]?.message ?? 'Invalid column mapping.' }, {
				status: 400
			});
		}
		columnMap = result.data;
	}

	const bytes = Buffer.from(await file.arrayBuffer());
	const text = bytes.toString('utf-8');

	const analysis = analyzeCsv(text, columnMap);
	if (!analysis.ok) {
		return json({ error: analysis.error }, { status: 400 });
	}
	if (analysis.dataRowCount > MAX_ROWS) {
		return json(
			{ error: `Too many rows. Maximum ${MAX_ROWS.toLocaleString()} per import.` },
			{ status: 400 }
		);
	}

	// Store the raw CSV in R2; the worker reads it back to do the actual import.
	const fileKey = `${auth.orgId}/contact_import/${randomUUID()}.csv`;
	await r2Upload(fileKey, bytes, 'text/csv');

	const [imp] = await db
		.insert(contactImports)
		.values({
			org_id: auth.orgId,
			uploaded_by: auth.member.id,
			file_key: fileKey,
			file_name: file.name || 'import.csv',
			status: 'pending',
			on_duplicate: onDuplicate,
			column_map: columnMap,
			total_rows: analysis.dataRowCount
		})
		.returning({ id: contactImports.id });

	await addJob(contactImportQueue(), CONTACT_IMPORT_JOB, {
		importId: imp.id,
		orgId: auth.orgId
	});

	return json({ data: { id: imp.id } });
};
