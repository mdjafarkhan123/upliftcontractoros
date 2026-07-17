/**
 * GET/POST/DELETE /api/admin/platform/email-domain
 *
 * Jafar admin only — /api/admin/* is guarded by hooks.server.ts (401 without a
 * jafar session). No checkPermission, no org context: jafar is fully isolated
 * (CLAUDE.md rule 12). PO-managed PLATFORM system email sending domain — the
 * outbound-only, singleton mirror of the per-org email-domain flow. All work lives
 * in $lib/server/email/platformEmailDomain.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getPlatformEmailState,
	createPlatformEmailDomain,
	deletePlatformEmailDomain,
	platformEmailCreateSchema
} from '$lib/server/email/platformEmailDomain';

function fieldErrors(err: import('zod').ZodError) {
	return Object.fromEntries(err.issues.map((i) => [String(i.path[0] ?? ''), i.message]));
}

export const GET: RequestHandler = async () => {
	return json({ data: await getPlatformEmailState() });
};

export const POST: RequestHandler = async ({ request }) => {
	const raw = await request.json().catch(() => ({}));
	const parsed = platformEmailCreateSchema.safeParse(raw);
	if (!parsed.success) {
		return json(
			{ error: 'Invalid request body.', field_errors: fieldErrors(parsed.error) },
			{ status: 400 }
		);
	}
	const result = await createPlatformEmailDomain(parsed.data);
	if (!result.ok) {
		return json(
			{
				error: result.error,
				...(result.field_errors ? { field_errors: result.field_errors } : {})
			},
			{ status: result.status }
		);
	}
	return json({ data: result.state }, { status: 201 });
};

export const DELETE: RequestHandler = async () => {
	const result = await deletePlatformEmailDomain();
	if (!result.ok) return json({ error: result.error }, { status: result.status });
	return new Response(null, { status: 204 });
};
