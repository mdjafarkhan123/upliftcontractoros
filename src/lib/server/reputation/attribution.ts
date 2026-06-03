import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import { organizations, reviewRequests } from '$lib/server/db/schema';
import type { db as dbClient } from '$lib/server/db/client';
import { emitReviewEvent } from './lifecycle';

type Tx = Parameters<Parameters<typeof dbClient.transaction>[0]>[0];

/** Window for the self-healing candidate select (per spec). */
const ATTRIBUTION_WINDOW_HOURS = 72;

export type AttributionRow = {
	review_request_id: string;
	confidence_score: number;
};

export type AttributionResult = {
	delta: number;
	matched: AttributionRow[];
	new_count: number;
};

/**
 * Score candidates by their position in the time-sorted list.
 * Spec: closest → 0.9, next → 0.6, rest → 0.3.
 */
function scoreFor(index: number): number {
	if (index === 0) return 0.9;
	if (index === 1) return 0.6;
	return 0.3;
}

/**
 * Run the attribution engine for one org.
 *
 * - Reads `organizations.last_known_review_count`; computes Δ.
 * - If Δ ≤ 0: updates baseline + `last_review_check_at`, returns no matches.
 * - If Δ > 0: selects up to Δ candidates with the triple guard
 *     (status='engaged' AND submitted_rating >= 4 AND attributed_at IS NULL)
 *   within the 72h self-healing window, sorted by `engaged_at DESC`.
 * - For each candidate, atomically flips to `likely_reviewed` (the per-row
 *   UPDATE re-enforces the triple guard for race-safety).
 * - Emits one `attributed` review_event per actually-flipped row.
 * - Always updates org baseline + `last_review_check_at` at the end.
 *
 * Idempotent under concurrent admin saves: a second call with the same
 * new_count produces Δ=0 and is a no-op. A second call with a higher count
 * skips already-attributed rows naturally because their status is no longer
 * 'engaged'.
 */
export async function runAttribution(
	tx: Tx,
	orgId: string,
	newCount: number
): Promise<AttributionResult> {
	if (!Number.isInteger(newCount) || newCount < 0) {
		throw new Error(`runAttribution: new_count must be a non-negative integer, got ${newCount}`);
	}

	const now = new Date();

	const [org] = await tx
		.select({ last_known_review_count: organizations.last_known_review_count })
		.from(organizations)
		.where(eq(organizations.id, orgId))
		.limit(1);
	if (!org) {
		throw new Error(`runAttribution: organization ${orgId} not found`);
	}

	const delta = newCount - (org.last_known_review_count ?? 0);

	if (delta <= 0) {
		await tx
			.update(organizations)
			.set({
				last_known_review_count: newCount,
				last_review_check_at: now,
				updated_at: now
			})
			.where(eq(organizations.id, orgId));
		return { delta, matched: [], new_count: newCount };
	}

	const windowStart = new Date(now.getTime() - ATTRIBUTION_WINDOW_HOURS * 60 * 60 * 1000);

	const candidates = await tx
		.select({ id: reviewRequests.id, engaged_at: reviewRequests.engaged_at })
		.from(reviewRequests)
		.where(
			and(
				eq(reviewRequests.org_id, orgId),
				eq(reviewRequests.status, 'engaged'),
				gte(reviewRequests.submitted_rating, 4),
				isNull(reviewRequests.attributed_at),
				isNull(reviewRequests.deleted_at),
				gte(reviewRequests.engaged_at, windowStart)
			)
		)
		.orderBy(desc(reviewRequests.engaged_at))
		.limit(delta);

	const matched: AttributionRow[] = [];

	for (let i = 0; i < candidates.length; i++) {
		const candidate = candidates[i];
		const confidence = scoreFor(i);

		const flipped = await tx
			.update(reviewRequests)
			.set({
				status: 'likely_reviewed',
				attributed_at: now,
				confidence_score: confidence.toFixed(2),
				updated_at: now
			})
			.where(
				and(
					eq(reviewRequests.id, candidate.id),
					eq(reviewRequests.status, 'engaged'),
					gte(reviewRequests.submitted_rating, 4),
					isNull(reviewRequests.attributed_at)
				)
			)
			.returning({ id: reviewRequests.id, org_id: reviewRequests.org_id });

		if (flipped.length === 0) continue;

		await emitReviewEvent(tx, {
			org_id: flipped[0].org_id,
			review_request_id: flipped[0].id,
			type: 'attributed',
			confidence_score: confidence
		});

		matched.push({ review_request_id: flipped[0].id, confidence_score: confidence });
	}

	await tx
		.update(organizations)
		.set({
			last_known_review_count: newCount,
			last_review_check_at: now,
			updated_at: now
		})
		.where(eq(organizations.id, orgId));

	return { delta, matched, new_count: newCount };
}

// Re-export for tests that want to verify the scoring curve directly.
export const __internal = { scoreFor, ATTRIBUTION_WINDOW_HOURS };
