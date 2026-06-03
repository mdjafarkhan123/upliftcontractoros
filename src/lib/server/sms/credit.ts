import { sql } from 'drizzle-orm';
import type { db as dbClient } from '$lib/server/db/client';

// Transaction-scoped client. Reserve/refund MUST run inside a tx so a failed
// guard rolls the balance change back cleanly (mirrors assertAndIncrementUsage).
export type DrizzleTx = Parameters<Parameters<typeof dbClient.transaction>[0]>[0];
export type DrizzleDb = typeof dbClient;
type DbOrTx = DrizzleDb | DrizzleTx;

export class InsufficientCreditError extends Error {
	readonly code = 'INSUFFICIENT_CREDIT';
	constructor(
		readonly balance: string,
		readonly cost: string
	) {
		super(`Insufficient SMS credit: balance ${balance} < cost ${cost}`);
		this.name = 'InsufficientCreditError';
	}
}

export type CreditState = {
	balance: number;
	monthly_included_credit: number;
	per_sms_cost: number;
	last_monthly_grant_at: Date | null;
	show_cost_to_contractor: boolean;
};

/**
 * Read-only credit snapshot for an org. Returns null if the org has no credit
 * row (should not happen post-backfill, but callers must handle it). Numbers
 * are parsed for display / soft pre-checks only — authoritative money math runs
 * in Postgres inside reserveSmsCredit.
 */
export async function getCreditState(dbOrTx: DbOrTx, orgId: string): Promise<CreditState | null> {
	const rows = await dbOrTx.execute<{
		balance: string;
		monthly_included_credit: string;
		per_sms_cost: string;
		last_monthly_grant_at: string | null;
		show_cost_to_contractor: boolean;
	}>(sql`
		SELECT balance, monthly_included_credit, per_sms_cost, last_monthly_grant_at,
			show_cost_to_contractor
		FROM org_sms_credit
		WHERE org_id = ${orgId}
		LIMIT 1
	`);
	const row = (rows as unknown as Array<Record<string, string | boolean | null>>)[0];
	if (!row) return null;
	return {
		balance: Number(row.balance),
		monthly_included_credit: Number(row.monthly_included_credit),
		per_sms_cost: Number(row.per_sms_cost),
		last_monthly_grant_at: row.last_monthly_grant_at
			? new Date(row.last_monthly_grant_at as string)
			: null,
		show_cost_to_contractor: row.show_cost_to_contractor === true
	};
}

export type ReserveResult =
	| { status: 'charged'; balanceAfter: string; cost: string }
	| { status: 'already_charged' };

/**
 * Atomically reserve `cost` against the org balance for a single outbound SMS.
 * MUST be called inside a transaction; the result is committed BEFORE the
 * Twilio call so the balance can never go negative even under concurrency.
 *
 * Idempotent on message_id via the `charge:{messageId}` ledger key:
 *  - If a charge already exists (a prior attempt reserved), returns
 *    'already_charged' and does NOT decrement again.
 *  - Otherwise decrements guarded by `balance >= cost`; if the guard fails it
 *    throws InsufficientCreditError (rolls back, nothing applied).
 *
 * `cost` is the org's per_sms_cost as a numeric string (e.g. '0.1000').
 */
export async function reserveSmsCredit(
	tx: DrizzleTx,
	args: {
		orgId: string;
		messageId: string;
		cost: string;
		createdBy?: string | null;
		// When provided (>0), a charge that drops the balance below 20% of this
		// allowance emits a one-per-cycle `sms.credit_low` outbox event in-tx.
		monthlyIncludedCredit?: number;
	}
): Promise<ReserveResult> {
	const { orgId, messageId, cost } = args;
	const key = `charge:${messageId}`;

	const existing = await tx.execute<{ exists: boolean }>(sql`
		SELECT 1 FROM sms_credit_ledger WHERE idempotency_key = ${key} LIMIT 1
	`);
	if ((existing as unknown as unknown[]).length > 0) {
		return { status: 'already_charged' };
	}

	const decremented = await tx.execute<{ balance: string }>(sql`
		UPDATE org_sms_credit
		SET balance = balance - ${cost}::numeric, updated_at = now()
		WHERE org_id = ${orgId} AND balance >= ${cost}::numeric
		RETURNING balance
	`);
	const balanceAfter = (decremented as unknown as Array<{ balance: string }>)[0]?.balance;
	if (balanceAfter === undefined) {
		const state = await getCreditState(tx, orgId);
		throw new InsufficientCreditError(String(state?.balance ?? 0), cost);
	}

	await tx.execute(sql`
		INSERT INTO sms_credit_ledger
			(org_id, entry_type, amount, balance_after, message_id, created_by, idempotency_key)
		VALUES
			(${orgId}, 'charge', ${`-${cost}`}::numeric, ${balanceAfter}::numeric, ${messageId},
			 ${args.createdBy ?? null}, ${key})
	`);

	// Low-credit warning: when this charge takes the balance below 20% of the
	// org's monthly allowance, flip the once-per-cycle guard and emit a
	// `sms.credit_low` outbox event. The guarded UPDATE (low_credit_notified_at
	// IS NULL) — on the row already locked by the decrement above — makes the
	// emit fire exactly once until the flag is cleared by a top-up or grant.
	const allowance = args.monthlyIncludedCredit ?? 0;
	if (allowance > 0 && Number(balanceAfter) < allowance * 0.2) {
		const flagged = await tx.execute(sql`
			UPDATE org_sms_credit
			SET low_credit_notified_at = now()
			WHERE org_id = ${orgId} AND low_credit_notified_at IS NULL
			RETURNING org_id
		`);
		if ((flagged as unknown as unknown[]).length > 0) {
			const payload = JSON.stringify({
				org_id: orgId,
				balance_after: balanceAfter,
				monthly_included_credit: allowance.toFixed(4),
				threshold_pct: 20
			});
			await tx.execute(sql`
				INSERT INTO outbox_events
					(org_id, event_type, resource_type, resource_id, payload, idempotency_key)
				VALUES
					(${orgId}, 'sms.credit_low', 'organization', ${orgId}, ${payload}::jsonb,
					 ${`sms.credit_low:${messageId}`})
			`);
		}
	}

	return { status: 'charged', balanceAfter, cost };
}

export type RefundResult = { status: 'refunded'; amount: string } | { status: 'noop' };

/**
 * Refund a previously-reserved SMS charge (failed/undeliverable send). Idempotent
 * on message_id via the `refund:{messageId}` ledger key, and a no-op if the
 * message was never charged. Refunds exactly what was charged (read from the
 * charge ledger row), so it stays correct regardless of later price changes.
 */
export async function refundSmsCredit(
	tx: DrizzleTx,
	args: { orgId: string; messageId: string; note?: string | null }
): Promise<RefundResult> {
	const { orgId, messageId } = args;
	const chargeKey = `charge:${messageId}`;
	const refundKey = `refund:${messageId}`;

	const charge = await tx.execute<{ amount: string }>(sql`
		SELECT amount FROM sms_credit_ledger WHERE idempotency_key = ${chargeKey} LIMIT 1
	`);
	const chargeAmount = (charge as unknown as Array<{ amount: string }>)[0]?.amount;
	if (chargeAmount === undefined) return { status: 'noop' }; // never charged

	const alreadyRefunded = await tx.execute(sql`
		SELECT 1 FROM sms_credit_ledger WHERE idempotency_key = ${refundKey} LIMIT 1
	`);
	if ((alreadyRefunded as unknown as unknown[]).length > 0) return { status: 'noop' };

	// charge amount is negative; refund the absolute value.
	const refunded = await tx.execute<{ balance: string }>(sql`
		UPDATE org_sms_credit
		SET balance = balance + abs(${chargeAmount}::numeric), updated_at = now()
		WHERE org_id = ${orgId}
		RETURNING balance
	`);
	const balanceAfter = (refunded as unknown as Array<{ balance: string }>)[0]?.balance;
	if (balanceAfter === undefined) return { status: 'noop' }; // org credit row gone

	await tx.execute(sql`
		INSERT INTO sms_credit_ledger
			(org_id, entry_type, amount, balance_after, message_id, note, idempotency_key)
		VALUES
			(${orgId}, 'refund', abs(${chargeAmount}::numeric), ${balanceAfter}::numeric, ${messageId},
			 ${args.note ?? null}, ${refundKey})
	`);

	return { status: 'refunded', amount: chargeAmount };
}

export type TopupResult = { balanceAfter: string };

/**
 * PO manual credit top-up via /jafar. Accumulates on top of existing balance.
 * `amount` is a positive numeric string. Each top-up is a distinct ledger entry
 * (unique key generated by the caller) — no idempotency collapsing.
 */
export async function applyManualTopup(
	tx: DrizzleTx,
	args: {
		orgId: string;
		amount: string;
		idempotencyKey: string;
		createdBy?: string | null;
		note?: string | null;
	}
): Promise<TopupResult> {
	// Clear the low-credit guard so a replenished org is eligible to be warned
	// again next time it crosses the threshold.
	const updated = await tx.execute<{ balance: string }>(sql`
		UPDATE org_sms_credit
		SET balance = balance + ${args.amount}::numeric,
			low_credit_notified_at = NULL,
			updated_at = now()
		WHERE org_id = ${args.orgId}
		RETURNING balance
	`);
	const balanceAfter = (updated as unknown as Array<{ balance: string }>)[0]?.balance;
	if (balanceAfter === undefined) {
		throw new Error(`No SMS credit row for org ${args.orgId}`);
	}

	await tx.execute(sql`
		INSERT INTO sms_credit_ledger
			(org_id, entry_type, amount, balance_after, created_by, note, idempotency_key)
		VALUES
			(${args.orgId}, 'manual_topup', ${args.amount}::numeric, ${balanceAfter}::numeric,
			 ${args.createdBy ?? null}, ${args.note ?? null}, ${args.idempotencyKey})
	`);

	return { balanceAfter };
}
