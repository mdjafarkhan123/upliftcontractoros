import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendReviewRequests } from '$lib/server/reputation/permissions';
import { runAttribution } from '$lib/server/reputation/attribution';

const BodySchema = z.object({
	new_count: z.number().int().min(0)
});

// POST /api/review-requests/reconcile-count
// Admin / manager reconciles the org's current Google review count.
// runAttribution runs synchronously inside a transaction — pure DB work, no
// external calls, so transaction-boundary law allows it. This guarantees the
// baseline + last_review_check_at are persisted before the response returns,
// so contractor-visible state never depends on an async worker being up.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendReviewRequests(auth.member)) error(403, 'Forbidden');

	let parsed: z.infer<typeof BodySchema>;
	try {
		const raw = await event.request.json();
		parsed = BodySchema.parse(raw);
	} catch (err) {
		if (err instanceof z.ZodError) {
			return json(
				{
					error: 'Invalid request body.',
					field_errors: Object.fromEntries(err.issues.map((i) => [i.path.join('.'), i.message]))
				},
				{ status: 400 }
			);
		}
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}

	const result = await db.transaction((tx) => runAttribution(tx, auth.orgId, parsed.new_count));

	return json({
		data: {
			previous_count: parsed.new_count - result.delta,
			new_count: result.new_count,
			delta: result.delta,
			matched: result.matched.length
		}
	});
};
