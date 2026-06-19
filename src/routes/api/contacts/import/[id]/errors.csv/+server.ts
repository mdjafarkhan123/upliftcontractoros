import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contactImports, type ContactImportErrorRow } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

function esc(val: string | number | null | undefined): string {
	if (val === null || val === undefined) return '';
	const s = String(val);
	if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}

// Downloadable report of every rejected row for an import, so the user can fix
// them and re-upload. Backed by contact_imports.error_rows (not sliced).
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const [imp] = await db
		.select({ error_rows: contactImports.error_rows })
		.from(contactImports)
		.where(and(eq(contactImports.id, event.params.id), eq(contactImports.org_id, auth.orgId)))
		.limit(1);

	if (!imp) error(404, 'Import not found');

	const rows = (imp.error_rows as ContactImportErrorRow[]) ?? [];
	const lines: string[] = ['Row,Reason'];
	for (const r of rows) {
		lines.push(`${esc(r.row)},${esc(r.reason)}`);
	}
	const csv = lines.join('\r\n');

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="import-errors-${event.params.id}.csv"`,
			'Cache-Control': 'no-store'
		}
	});
};
