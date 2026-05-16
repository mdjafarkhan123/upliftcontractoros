/**
 * Cron 2 — Quote expiry sweep.
 *
 * Schedule: 30 2 * * * (UTC).
 * Purpose:  Flip eligible quotes to 'expired' and emit quote.expired ONLY for
 *           rows whose status actually transitioned during this run.
 * Idempotency:
 *   - UPDATE only matches sent/viewed rows past expires_at, so re-runs are
 *     no-ops once everything has flipped.
 *   - outbox_events.idempotency_key = `quote.expired:{quote_id}` — once
 *     emitted, the unique index blocks duplicates.
 * Failure behavior:
 *   - Errors bubble to runGuarded() which catches, logs, and continues.
 */
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import type { CronJobResult } from './index';

type ExpiredRow = {
	id: string;
	org_id: string;
	contact_id: string;
	quote_number: number;
	total: string;
	expires_at: string | null;
	[key: string]: unknown;
};

export async function runQuoteExpirySweep(): Promise<CronJobResult> {
	return db.transaction(async (tx) => {
		const updated = await tx.execute<ExpiredRow>(sql`
			UPDATE quotes
			SET status = 'expired', updated_at = now()
			WHERE status IN ('sent', 'viewed')
				AND expires_at IS NOT NULL
				AND expires_at < now()
				AND deleted_at IS NULL
			RETURNING id, org_id, contact_id, quote_number, total, expires_at
		`);

		const rows = updated as unknown as ExpiredRow[];
		let processed = 0;

		for (const q of rows) {
			const payload = {
				quote_id: q.id,
				contact_id: q.contact_id,
				quote_number: q.quote_number,
				total: q.total,
				expires_at: q.expires_at
			};

			await tx.execute(sql`
				INSERT INTO outbox_events (
					org_id, event_type, event_version, resource_type, resource_id,
					payload, idempotency_key
				) VALUES (
					${q.org_id}, 'quote.expired', 1, 'quote', ${q.id},
					${JSON.stringify(payload)}::jsonb,
					${`quote.expired:${q.id}`}
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
