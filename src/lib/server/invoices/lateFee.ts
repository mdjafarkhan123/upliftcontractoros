import { sql } from 'drizzle-orm';
import type { db as DbClient } from '$lib/server/db/client';

type Tx = Parameters<Parameters<typeof DbClient.transaction>[0]>[0];

// The per-invoice late-fee columns seeded at creation (M8 Phase 2). late_fee_value collapses the
// org's two value columns (flat_amount / percent) into one, keyed by the active type.
export type LateFeeSnapshot = {
	late_fee_enabled: boolean;
	late_fee_type: string;
	late_fee_value: string | null;
};

/**
 * Snapshot the org's active late-fee terms into the values a NEW invoice stores. Called at EVERY
 * invoice-creation point (hand-made, quote→invoice, job→invoice, milestone) so every invoice
 * inherits the same company default — which the New Invoice form and the invoice detail page can
 * then override per client. After creation the invoice's own columns are authoritative; the org
 * config is never read live again (the manual button + the auto-after-grace sweep both read the
 * invoice snapshot). Keep this the single source of the snapshot rule so it never drifts.
 */
export async function orgLateFeeSnapshot(tx: Tx, orgId: string): Promise<LateFeeSnapshot> {
	const [org] = await tx.execute<{
		late_fee_enabled: boolean;
		late_fee_type: string | null;
		late_fee_flat_amount: string | null;
		late_fee_percent: string | null;
	}>(sql`
		SELECT late_fee_enabled, late_fee_type, late_fee_flat_amount, late_fee_percent
		FROM organizations
		WHERE id = ${orgId}
	`);
	const type = org?.late_fee_type === 'flat' ? 'flat' : 'percent';
	const value = type === 'flat' ? org?.late_fee_flat_amount : org?.late_fee_percent;
	return {
		late_fee_enabled: org?.late_fee_enabled ?? false,
		late_fee_type: type,
		late_fee_value: value ?? null
	};
}
