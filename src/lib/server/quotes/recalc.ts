import { sql } from 'drizzle-orm';
import type { db as DbClient } from '$lib/server/db/client';

type Tx = Parameters<Parameters<typeof DbClient.transaction>[0]>[0];

/**
 * Recalculate quote subtotal/tax/total from non-deleted line items.
 * Caller MUST hold a row lock on the quote (SELECT ... FOR UPDATE) before calling
 * to serialize against concurrent line-item edits.
 */
export async function recalcQuoteTotals(tx: Tx, quoteId: string): Promise<void> {
	await tx.execute(sql`
		WITH agg AS (
			SELECT COALESCE(SUM(total), 0)::numeric(12,2) AS subtotal
			FROM quote_line_items
			WHERE quote_id = ${quoteId} AND deleted_at IS NULL
		)
		UPDATE quotes
		SET
			subtotal = agg.subtotal,
			tax_amount = ROUND(agg.subtotal * quotes.tax_rate, 2),
			total = ROUND(agg.subtotal + (agg.subtotal * quotes.tax_rate), 2),
			updated_at = now()
		FROM agg
		WHERE quotes.id = ${quoteId};
	`);
}

export function computeLineTotal(quantity: number, unit_price: number): string {
	return (Math.round(quantity * unit_price * 100) / 100).toFixed(2);
}
