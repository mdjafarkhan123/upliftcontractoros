import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations } from '$lib/server/db/schema';
import { runAttribution } from '$lib/server/reputation/attribution';

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ new_count: z.number().int().min(0) });

// Jafar-admin variant of /api/review-requests/reconcile-count. Takes org_id
// from the URL (master admin view). `/api/admin/*` is gated globally in
// hooks.server.ts via getJafarSession() — the platform owner has implicit
// cross-org access, so no per-org membership check is required here.
// runAttribution runs synchronously inside a transaction; this guarantees the
// baseline + last_review_check_at land on the org row before the response
// returns, so the contractor-facing summary reflects the value immediately.
export const POST: RequestHandler = async ({ params, request }) => {
	const parsedParams = paramsSchema.safeParse(params);
	if (!parsedParams.success) throw error(400, 'Invalid organization ID.');

	const raw = await request.json().catch(() => ({}));
	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return json(
			{
				error: 'Invalid request body.',
				field_errors: Object.fromEntries(
					parsed.error.issues.map((i) => [i.path.join('.'), i.message])
				)
			},
			{ status: 400 }
		);
	}

	const orgId = parsedParams.data.id;

	const [exists] = await db
		.select({ id: organizations.id })
		.from(organizations)
		.where(eq(organizations.id, orgId))
		.limit(1);
	if (!exists) throw error(404, 'Organization not found.');

	const result = await db.transaction((tx) => runAttribution(tx, orgId, parsed.data.new_count));

	return json({
		data: {
			previous_count: parsed.data.new_count - result.delta,
			new_count: result.new_count,
			delta: result.delta,
			matched: result.matched.length
		}
	});
};
