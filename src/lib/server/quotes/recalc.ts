import { sql } from 'drizzle-orm';
import type { db as DbClient } from '$lib/server/db/client';

type Tx = Parameters<Parameters<typeof DbClient.transaction>[0]>[0];

/**
 * Recalculate quote subtotal/discount/tax/total from non-deleted, NON-OPTIONAL line items.
 * `subtotal` is the pre-discount sum of required lines. A quote-level discount (fixed or
 * percent) is then applied to that subtotal BEFORE tax — tax is charged on the discounted
 * amount, the industry-standard order. A fixed discount is clamped to the subtotal so the
 * total can never go negative; a percent discount is clamped to 100%. Optional add-ons are
 * deliberately excluded from the base total — they only add to the accepted total if the
 * customer selects them (see the accept route). Caller MUST hold a row lock on the quote
 * (SELECT ... FOR UPDATE) before calling to serialize against concurrent line-item edits.
 */
export async function recalcQuoteTotals(tx: Tx, quoteId: string): Promise<void> {
	await tx.execute(sql`
		WITH agg AS (
			SELECT COALESCE(SUM(total), 0)::numeric(12,2) AS subtotal
			FROM quote_line_items
			WHERE quote_id = ${quoteId} AND deleted_at IS NULL AND is_optional = false
		),
		disc AS (
			SELECT
				agg.subtotal,
				CASE
					WHEN q.discount_type = 'percent' AND q.discount_value IS NOT NULL
						THEN ROUND(agg.subtotal * LEAST(q.discount_value, 100) / 100, 2)
					WHEN q.discount_type = 'fixed' AND q.discount_value IS NOT NULL
						THEN LEAST(GREATEST(q.discount_value, 0), agg.subtotal)
					ELSE 0
				END::numeric(12,2) AS discount_amount
			FROM agg, quotes q
			WHERE q.id = ${quoteId}
		),
		computed AS (
			SELECT
				disc.subtotal,
				disc.discount_amount,
				(disc.subtotal - disc.discount_amount)::numeric(12,2)                          AS discounted,
				ROUND((disc.subtotal - disc.discount_amount) * q.tax_rate, 2)                  AS tax_amount,
				ROUND((disc.subtotal - disc.discount_amount)
					+ (disc.subtotal - disc.discount_amount) * q.tax_rate, 2)                   AS new_total
			FROM disc, quotes q
			WHERE q.id = ${quoteId}
		)
		UPDATE quotes
		SET
			subtotal        = computed.subtotal,
			discount_amount = CASE WHEN quotes.discount_type = 'none' THEN NULL ELSE computed.discount_amount END,
			tax_amount      = computed.tax_amount,
			total           = computed.new_total,
			deposit_amount = CASE
				WHEN deposit_required = true
				  AND deposit_type = 'percent'
				  AND deposit_percent IS NOT NULL
				THEN ROUND(computed.new_total * deposit_percent / 100, 2)
				ELSE deposit_amount
			END,
			updated_at   = now()
		FROM computed
		WHERE quotes.id = ${quoteId};
	`);
}

export function computeLineTotal(quantity: number, unit_price: number): string {
	return (Math.round(quantity * unit_price * 100) / 100).toFixed(2);
}
