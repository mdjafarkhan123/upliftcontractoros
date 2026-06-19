import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { pipelineStages } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { reorderStagesSchema } from '$lib/server/pipeline/schemas';

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_manage_pipeline) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = reorderStagesSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
	}

	const { stage_ids } = parsed.data;

	// Reject duplicates up front so the permutation check below is meaningful.
	if (new Set(stage_ids).size !== stage_ids.length) {
		return json({ error: 'Duplicate stage ids in reorder request.' }, { status: 422 });
	}

	// The submitted list must be an exact permutation of the org's live stages —
	// guards against a stale client list (added/deleted stage elsewhere).
	const existing = await db
		.select({ id: pipelineStages.id })
		.from(pipelineStages)
		.where(and(eq(pipelineStages.org_id, auth.orgId), isNull(pipelineStages.deleted_at)));

	const existingIds = new Set(existing.map((s) => s.id));
	if (existingIds.size !== stage_ids.length || !stage_ids.every((sid) => existingIds.has(sid))) {
		return json(
			{ error: 'Your stage list is out of date. Refresh and try again.' },
			{ status: 409 }
		);
	}

	const now = new Date();
	await db.transaction(async (tx) => {
		for (let i = 0; i < stage_ids.length; i++) {
			await tx
				.update(pipelineStages)
				.set({ position: i + 1, updated_at: now })
				.where(and(eq(pipelineStages.id, stage_ids[i]), eq(pipelineStages.org_id, auth.orgId)));
		}
	});

	return new Response(null, { status: 204 });
};
