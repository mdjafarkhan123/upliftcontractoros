/**
 * Cron — Monthly SMS credit grant.
 *
 * Schedule: 0 5 1 * * (UTC) — 05:00 on the 1st of each month.
 * Purpose:  Add each active org's monthly_included_credit to its balance
 *           (rollover — accumulates on top of whatever remains).
 * Idempotency: Guarded by the ledger key `monthly_grant:{orgId}:YYYY-MM` via a
 *           NOT EXISTS filter plus the UNIQUE constraint. Re-running within the
 *           same calendar month grants nothing.
 * Atomicity: One statement (CTE) — balance update + ledger insert commit
 *           together, so a row is never updated without its audit entry.
 * Failure behavior: runGuarded() catches and logs.
 */
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import type { CronJobResult } from './index';

export async function runSmsMonthlyGrant(): Promise<CronJobResult> {
	const granted = await db.execute<{ org_id: string }>(sql`
		WITH period AS (
			SELECT to_char(now(), 'YYYY-MM') AS ym
		),
		candidates AS (
			SELECT c.org_id, c.monthly_included_credit
			FROM org_sms_credit c
			JOIN organizations o ON o.id = c.org_id
			WHERE o.status = 'active'
				AND c.monthly_included_credit > 0
				AND NOT EXISTS (
					SELECT 1 FROM sms_credit_ledger l
					WHERE l.idempotency_key =
						'monthly_grant:' || c.org_id::text || ':' || (SELECT ym FROM period)
				)
		),
		updated AS (
			UPDATE org_sms_credit c
			SET balance = balance + ca.monthly_included_credit,
				last_monthly_grant_at = now(),
				low_credit_notified_at = NULL,
				updated_at = now()
			FROM candidates ca
			WHERE c.org_id = ca.org_id
			RETURNING c.org_id, c.balance, ca.monthly_included_credit
		)
		INSERT INTO sms_credit_ledger
			(org_id, entry_type, amount, balance_after, idempotency_key)
		SELECT u.org_id, 'monthly_grant', u.monthly_included_credit, u.balance,
			'monthly_grant:' || u.org_id::text || ':' || (SELECT ym FROM period)
		FROM updated u
		RETURNING org_id
	`);

	const count = (granted as unknown as { org_id: string }[]).length;
	return {
		scanned_count: count,
		affected_count: count,
		processed_count: count,
		skipped_count: 0,
		error_count: 0
	};
}
