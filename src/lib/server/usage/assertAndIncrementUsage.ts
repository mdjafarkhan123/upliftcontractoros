import { sql } from 'drizzle-orm';
import type { db as dbClient } from '$lib/server/db/client';

// Transaction-scoped client only. Accepting `typeof db` would let callers run
// this outside a tx, in which case a failed limit check would leave the counter
// permanently incremented (no rollback). This type narrows to the tx callback's
// `tx` argument, so passing the base `db` is a compile-time error.
export type DrizzleTx = Parameters<Parameters<typeof dbClient.transaction>[0]>[0];

// Read-only client (base or tx). Used by `getCurrentUsage` for soft pre-flight
// checks where no mutation occurs.
export type DrizzleDb = typeof dbClient;

export type UsageMetric =
	| 'sms_sent'
	| 'bulk_sms_sent'
	| 'ai_requests'
	| 'storage_bytes'
	| 'automation_workflows'; // Reserved — hook into create/delete routes when workflows-as-data lands

export type Periodicity = 'monthly' | 'daily' | 'lifetime';

export const BYTES_PER_GB = 1024 * 1024 * 1024;

// Fixed per-metric periodicity. Caller passes the metric; the helper picks
// the period_start_date. Prevents the "bulk_sms_sent accidentally monthly"
// footgun.
const METRIC_PERIODICITY: Record<UsageMetric, Periodicity> = {
	sms_sent: 'monthly',
	bulk_sms_sent: 'daily',
	ai_requests: 'monthly',
	storage_bytes: 'lifetime',
	automation_workflows: 'lifetime'
};

export class UsageLimitExceededError extends Error {
	readonly code = 'LIMIT_EXCEEDED';
	constructor(
		readonly metric: UsageMetric,
		readonly max: number,
		readonly current: number
	) {
		super(`Usage limit reached for ${metric}: ${current}/${max}`);
		this.name = 'UsageLimitExceededError';
	}
}

interface AssertAndIncrementUsageArgs {
	orgId: string;
	metric: UsageMetric;
	/**
	 * Maximum allowed value for this metric. Caller supplies the converted unit:
	 *  - storage_bytes: pass `auth.limits.max_storage_gb * BYTES_PER_GB`
	 *  - all others:    pass the raw count from auth.limits.
	 */
	limit: number;
	/**
	 * Signed delta. Positive consumes quota; negative releases (storage delete,
	 * workflow delete/disable). Negative values never throw on the limit; the
	 * DB CHECK (value >= 0) protects against underflow.
	 */
	increment: number;
}

/**
 * Atomic check-and-increment for org usage counters. MUST be called inside a
 * transaction — the `tx` parameter type enforces this at compile time.
 *
 * Behavior:
 *  - One SQL round trip: INSERT … ON CONFLICT DO UPDATE … RETURNING value.
 *  - Throws `UsageLimitExceededError` (HTTP 403 by convention) if the new
 *    value exceeds the limit AND the increment is positive. The throw rolls
 *    back the surrounding tx, so the counter does not move.
 *  - Negative increments are always allowed; underflow is guarded by the DB
 *    CHECK constraint.
 */
export async function assertAndIncrementUsage(
	tx: DrizzleTx,
	args: AssertAndIncrementUsageArgs
): Promise<{ newValue: number; max: number }> {
	const { orgId, metric, limit, increment } = args;
	const periodicity = METRIC_PERIODICITY[metric];

	const periodExpr =
		periodicity === 'monthly'
			? sql`date_trunc('month', now())::date`
			: periodicity === 'daily'
				? sql`now()::date`
				: sql`'1900-01-01'::date`;

	const rows = await tx.execute<{ value: string | number }>(sql`
		INSERT INTO org_usage (org_id, period_start_date, metric, value, last_incremented_at)
		VALUES (${orgId}, ${periodExpr}, ${metric}, ${increment}, now())
		ON CONFLICT (org_id, period_start_date, metric)
		DO UPDATE SET
			value = org_usage.value + EXCLUDED.value,
			last_incremented_at = now()
		RETURNING value
	`);

	// postgres-js returns array-like with .[0]; bigint comes back as string.
	const raw = (rows as unknown as Array<{ value: string | number }>)[0]?.value;
	const newValue = typeof raw === 'string' ? Number(raw) : (raw ?? 0);

	if (increment > 0 && newValue > limit) {
		throw new UsageLimitExceededError(metric, limit, newValue);
	}

	return { newValue, max: limit };
}

/**
 * Read-only current usage for a metric in its active period. Returns 0 if no
 * row exists yet for the current period. Use for soft pre-flight checks in
 * route handlers (give the caller an immediate 403 without writing).
 *
 * Authoritative enforcement still happens via `assertAndIncrementUsage` at
 * the worker / direct-send chokepoint — this is purely a UX shortcut.
 */
export async function getCurrentUsage(
	dbOrTx: DrizzleDb | DrizzleTx,
	orgId: string,
	metric: UsageMetric
): Promise<number> {
	const periodicity = METRIC_PERIODICITY[metric];
	const periodExpr =
		periodicity === 'monthly'
			? sql`date_trunc('month', now())::date`
			: periodicity === 'daily'
				? sql`now()::date`
				: sql`'1900-01-01'::date`;

	const rows = await dbOrTx.execute<{ value: string | number }>(sql`
		SELECT value
		FROM org_usage
		WHERE org_id = ${orgId}
		  AND metric = ${metric}
		  AND period_start_date = ${periodExpr}
		LIMIT 1
	`);

	const raw = (rows as unknown as Array<{ value: string | number }>)[0]?.value;
	if (raw === undefined) return 0;
	return typeof raw === 'string' ? Number(raw) : raw;
}
