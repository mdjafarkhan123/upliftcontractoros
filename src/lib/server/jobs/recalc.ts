import { sql } from 'drizzle-orm';
import type { db as DbClient } from '$lib/server/db/client';

type Tx = Parameters<Parameters<typeof DbClient.transaction>[0]>[0];

/**
 * Recalculate a job's subtotal/discount/tax/total from its non-deleted line items.
 * Mirrors recalcQuoteTotals: `subtotal` is the sum of all line totals, a job-level discount
 * (fixed or percent) is applied to that subtotal BEFORE tax (industry-standard order), and tax
 * is charged on the discounted amount. A fixed discount is clamped to the subtotal (total can
 * never go negative); a percent discount is clamped to 100%. Jobs have no optional add-ons and
 * no deposit, so every line counts and there is no deposit math. Caller MUST hold a row lock on
 * the job (SELECT ... FOR UPDATE) before calling to serialize against concurrent line edits.
 */
export async function recalcJobTotals(tx: Tx, jobId: string): Promise<void> {
	await tx.execute(sql`
		WITH agg AS (
			SELECT COALESCE(SUM(total), 0)::numeric(12,2) AS subtotal
			FROM job_line_items
			WHERE job_id = ${jobId} AND deleted_at IS NULL
		),
		disc AS (
			SELECT
				agg.subtotal,
				CASE
					WHEN j.discount_type = 'percent' AND j.discount_value IS NOT NULL
						THEN ROUND(agg.subtotal * LEAST(j.discount_value, 100) / 100, 2)
					WHEN j.discount_type = 'fixed' AND j.discount_value IS NOT NULL
						THEN LEAST(GREATEST(j.discount_value, 0), agg.subtotal)
					ELSE 0
				END::numeric(12,2) AS discount_amount
			FROM agg, jobs j
			WHERE j.id = ${jobId}
		),
		computed AS (
			SELECT
				disc.subtotal,
				disc.discount_amount,
				ROUND((disc.subtotal - disc.discount_amount) * j.tax_rate, 2)                  AS tax_amount,
				ROUND((disc.subtotal - disc.discount_amount)
					+ (disc.subtotal - disc.discount_amount) * j.tax_rate, 2)                   AS new_total
			FROM disc, jobs j
			WHERE j.id = ${jobId}
		)
		UPDATE jobs
		SET
			subtotal        = computed.subtotal,
			discount_amount = CASE WHEN jobs.discount_type = 'none' THEN NULL ELSE computed.discount_amount END,
			tax_amount      = computed.tax_amount,
			total           = computed.new_total,
			updated_at      = now()
		FROM computed
		WHERE jobs.id = ${jobId};
	`);
}

export function computeLineTotal(quantity: number, unit_price: number): string {
	return (Math.round(quantity * unit_price * 100) / 100).toFixed(2);
}
