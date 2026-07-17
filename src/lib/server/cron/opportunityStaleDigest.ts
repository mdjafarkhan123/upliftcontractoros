/**
 * Cron — Daily stale-deal digest.
 *
 * Schedule: 08:00 UTC daily.
 * Purpose:  Find open deals with no follow-up scheduled and emit one
 *           opportunity.stale_digest outbox event per org so the notification
 *           worker can send a single grouped "X deals need follow-up" alert
 *           to the relevant members. Pipeline Gap #2 Phase B.
 * Behavior:
 *   - Claims open, non-deleted deals where next_follow_up_at IS NULL and
 *     either stale_nudged_at IS NULL or it was set more than 24 h ago.
 *   - Sets stale_nudged_at = now() on every claimed row in the SAME transaction
 *     as the outbox INSERT (transaction boundary law). This acts as a per-deal
 *     dedupe guard so a deal nudged today cannot re-surface until tomorrow.
 *   - stale_nudged_at is cleared by the opportunity PATCH when next_follow_up_at
 *     is set, so the deal re-enters the digest cycle after the follow-up fires.
 *   - Emits one outbox event per org (resource_id = org_id). The notification
 *     worker fans it out to assignees + admin/manager fallback.
 * Idempotency:
 *   - stale_nudged_at is written on claim, so a re-run immediately after skips
 *     all deals that were just processed (they now fail the 24 h guard).
 *   - outbox idempotency_key: `opportunity.stale_digest:{org_id}:{date_utc}`
 *     prevents a second event if the cron fires twice in the same UTC day.
 */
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import type { CronJobResult } from './index';

type EligibleRow = {
	id: string;
	org_id: string;
	assigned_to: string | null;
	[key: string]: unknown;
};

const CLAIM_LIMIT = 2000;

export async function runOpportunityStaleDigest(): Promise<CronJobResult> {
	return db.transaction(async (tx) => {
		// Claim eligible deals and stamp stale_nudged_at in one CTE so concurrent
		// runs can never double-claim the same row.
		const claimed = await tx.execute<EligibleRow>(sql`
			WITH eligible AS (
				SELECT id, org_id, assigned_to
				FROM opportunities
				WHERE status = 'open'
					AND deleted_at IS NULL
					AND next_follow_up_at IS NULL
					AND (
						stale_nudged_at IS NULL
						OR stale_nudged_at < now() - interval '24 hours'
					)
				ORDER BY org_id, created_at
				FOR UPDATE SKIP LOCKED
				LIMIT ${CLAIM_LIMIT}
			), stamped AS (
				UPDATE opportunities o
				SET stale_nudged_at = now(), updated_at = now()
				FROM eligible
				WHERE o.id = eligible.id
			)
			SELECT id, org_id, assigned_to FROM eligible
		`);

		const rows = claimed as unknown as EligibleRow[];
		if (rows.length === 0) {
			return {
				scanned_count: 0,
				affected_count: 0,
				processed_count: 0,
				skipped_count: 0,
				error_count: 0
			};
		}

		// Group by org to emit one event per org.
		const byOrg = new Map<string, { dealIds: string[]; assigneeIds: Set<string> }>();
		for (const row of rows) {
			let entry = byOrg.get(row.org_id);
			if (!entry) {
				entry = { dealIds: [], assigneeIds: new Set() };
				byOrg.set(row.org_id, entry);
			}
			entry.dealIds.push(row.id);
			if (row.assigned_to) entry.assigneeIds.add(row.assigned_to);
		}

		const dateUtc = new Date().toISOString().slice(0, 10);
		let processed = 0;

		for (const [orgId, { dealIds, assigneeIds }] of byOrg) {
			const payload = {
				event_version: 1,
				org_id: orgId,
				deal_count: dealIds.length,
				deal_ids: dealIds,
				assignee_ids: [...assigneeIds]
			};
			await tx.execute(sql`
				INSERT INTO outbox_events (
					org_id, event_type, event_version, resource_type, resource_id,
					payload, idempotency_key
				) VALUES (
					${orgId}, 'opportunity.stale_digest', 1, 'organization', ${orgId},
					${JSON.stringify(payload)}::jsonb,
					${`opportunity.stale_digest:${orgId}:${dateUtc}`}
				)
				ON CONFLICT (idempotency_key) DO NOTHING
			`);
			processed += 1;
		}

		return {
			scanned_count: rows.length,
			affected_count: rows.length,
			processed_count: processed,
			skipped_count: 0,
			error_count: 0
		};
	});
}
