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
 *
 * Good-Better-Best: on a TIERED quote (one or more quote_packages rows), each package's
 * denormalized subtotal/total is refreshed first, then the quote's HEADLINE base subtotal
 * mirrors the RECOMMENDED package (fallback: highest-total package, then lowest position).
 * On a SIMPLE quote (no packages) the base is the sum of all required lines, exactly as
 * before. Discount/tax/deposit then apply to that base identically in both cases.
 *
 * Per-line tax: only lines with taxable = true feed the tax base. The quote-level discount
 * is allocated proportionally across the whole subtotal, so tax is charged on the taxable
 * SHARE of the discounted amount (taxable_subtotal * discounted / subtotal * tax_rate). When
 * every line is taxable this collapses to the old behavior (discounted * tax_rate) exactly.
 */
export async function recalcQuoteTotals(tx: Tx, quoteId: string): Promise<void> {
	// Step 1 — refresh each package's own denormalized base subtotal/total (required lines
	// only; optional add-ons add on top at acceptance). Package total taxes only its taxable
	// required lines. No-op when the quote has no packages.
	await tx.execute(sql`
		UPDATE quote_packages qp
		SET
			subtotal   = agg.sub,
			total      = ROUND(agg.sub + agg.taxable_sub * q.tax_rate, 2),
			updated_at = now()
		FROM (
			SELECT p.id AS package_id,
				COALESCE(SUM(li.total), 0)::numeric(12,2) AS sub,
				COALESCE(SUM(li.total) FILTER (WHERE li.taxable = true), 0)::numeric(12,2) AS taxable_sub
			FROM quote_packages p
			LEFT JOIN quote_line_items li
				ON li.package_id = p.id
				AND li.deleted_at IS NULL
				AND li.is_optional = false
			WHERE p.quote_id = ${quoteId} AND p.deleted_at IS NULL
			GROUP BY p.id
		) agg,
		quotes q
		WHERE qp.id = agg.package_id AND q.id = ${quoteId};
	`);

	// Step 2 — recompute the quote's headline totals from the base subtotal (recommended
	// package when tiered, else all required lines) and apply discount → tax → deposit.
	await tx.execute(sql`
		WITH pkgs AS (
			SELECT id, subtotal, is_recommended, total, position
			FROM quote_packages
			WHERE quote_id = ${quoteId} AND deleted_at IS NULL
		),
		chosen AS (
			SELECT id, subtotal FROM pkgs
			ORDER BY is_recommended DESC, total DESC, position ASC
			LIMIT 1
		),
		agg AS (
			SELECT
				(
					CASE WHEN EXISTS (SELECT 1 FROM pkgs)
						THEN COALESCE((SELECT subtotal FROM chosen), 0)
						ELSE (
							SELECT COALESCE(SUM(total), 0)
							FROM quote_line_items
							WHERE quote_id = ${quoteId} AND deleted_at IS NULL AND is_optional = false
						)
					END
				)::numeric(12,2) AS subtotal,
				(
					CASE WHEN EXISTS (SELECT 1 FROM pkgs)
						THEN COALESCE((
							SELECT SUM(li.total)
							FROM quote_line_items li
							WHERE li.package_id = (SELECT id FROM chosen)
								AND li.deleted_at IS NULL AND li.is_optional = false AND li.taxable = true
						), 0)
						ELSE (
							SELECT COALESCE(SUM(total), 0)
							FROM quote_line_items
							WHERE quote_id = ${quoteId} AND deleted_at IS NULL AND is_optional = false AND taxable = true
						)
					END
				)::numeric(12,2) AS taxable_subtotal
		),
		disc AS (
			SELECT
				agg.subtotal,
				agg.taxable_subtotal,
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
				-- taxable base after proportionally allocating the discount to taxable lines
				ROUND(
					CASE WHEN disc.subtotal > 0
						THEN disc.taxable_subtotal * (disc.subtotal - disc.discount_amount) / disc.subtotal
						ELSE 0
					END * q.tax_rate, 2)                                                       AS tax_amount,
				ROUND((disc.subtotal - disc.discount_amount)
					+ CASE WHEN disc.subtotal > 0
						THEN disc.taxable_subtotal * (disc.subtotal - disc.discount_amount) / disc.subtotal
						ELSE 0
					END * q.tax_rate, 2)                                                       AS new_total
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
