import { sql } from 'drizzle-orm';
import type { db as DbClient } from '$lib/server/db/client';

type Tx = Parameters<Parameters<typeof DbClient.transaction>[0]>[0];

/**
 * Recalculate invoice subtotal/discount/tax/total from non-deleted line items,
 * and amount_paid/amount_due from immutable payments.
 * Caller MUST hold a row lock on the invoice (SELECT ... FOR UPDATE) before calling.
 * Re-derives status (paid / past_due / awaiting_payment / sent_not_due — Jobber's set) and sets
 * paid_at when the balance hits zero. Draft and bad_debt rows are frozen.
 *
 * `subtotal` is the pre-discount sum of all lines. An invoice-level discount (fixed or
 * percent) is applied to that subtotal BEFORE tax — the industry-standard order (Jobber /
 * Housecall Pro / QuickBooks), identical to recalcQuoteTotals. A fixed discount is clamped
 * to the subtotal so the total can never go negative; a percent discount is clamped to 100%.
 *
 * Per-line tax: only lines with taxable = true feed the tax base (labor is commonly
 * non-taxable). The invoice-level discount is allocated proportionally across the whole
 * subtotal, so tax is charged on the taxable SHARE of the discounted amount
 * (taxable_subtotal * discounted / subtotal * tax_rate). With no discount and every line
 * taxable this collapses to the old subtotal * tax_rate exactly.
 *
 * Late fees (M8): a line flagged is_late_fee is real money the customer owes, but it is NOT
 * ordinary work — it is EXCLUDED from the subtotal (so it is never discounted) and from the tax
 * base (never taxed), then its sum is added to `total` AFTER tax as its own late_fee_total. With
 * no late-fee line present, late_fee_total = 0 and the math is byte-identical to before.
 */
export async function recalcInvoiceTotals(tx: Tx, invoiceId: string): Promise<void> {
	await tx.execute(sql`
		WITH lines AS (
			SELECT
				COALESCE(SUM(total) FILTER (WHERE is_late_fee = false), 0)::numeric(12,2) AS subtotal,
				COALESCE(SUM(total) FILTER (WHERE taxable = true AND is_late_fee = false), 0)::numeric(12,2) AS taxable_subtotal,
				COALESCE(SUM(total) FILTER (WHERE is_late_fee = true), 0)::numeric(12,2) AS late_fee_total
			FROM invoice_line_items
			WHERE invoice_id = ${invoiceId} AND deleted_at IS NULL
		),
		paid AS (
			SELECT
				COALESCE(SUM(amount), 0)::numeric(12,2) AS amount_paid,
				COALESCE(SUM(tip_amount), 0)::numeric(12,2) AS tip_total
			FROM payments
			WHERE invoice_id = ${invoiceId}
		),
		disc AS (
			SELECT
				lines.subtotal,
				lines.taxable_subtotal,
				lines.late_fee_total,
				CASE
					WHEN inv.discount_type = 'percent' AND inv.discount_value IS NOT NULL
						THEN ROUND(lines.subtotal * LEAST(inv.discount_value, 100) / 100, 2)
					WHEN inv.discount_type = 'fixed' AND inv.discount_value IS NOT NULL
						THEN LEAST(GREATEST(inv.discount_value, 0), lines.subtotal)
					ELSE 0
				END::numeric(12,2) AS discount_amount
			FROM lines, invoices inv
			WHERE inv.id = ${invoiceId}
		),
		calc AS (
			SELECT
				disc.subtotal,
				disc.discount_amount,
				disc.late_fee_total,
				ROUND(
					CASE WHEN disc.subtotal > 0
						THEN disc.taxable_subtotal * (disc.subtotal - disc.discount_amount) / disc.subtotal
						ELSE 0
					END * invoices.tax_rate, 2) AS tax_amount,
				ROUND((disc.subtotal - disc.discount_amount)
					+ CASE WHEN disc.subtotal > 0
						THEN disc.taxable_subtotal * (disc.subtotal - disc.discount_amount) / disc.subtotal
						ELSE 0
					END * invoices.tax_rate
					+ disc.late_fee_total, 2) AS total
			FROM disc, invoices
			WHERE invoices.id = ${invoiceId}
		)
		UPDATE invoices
		SET
			subtotal    = calc.subtotal,
			discount_amount = CASE WHEN invoices.discount_type = 'none' THEN NULL ELSE calc.discount_amount END,
			tax_amount  = calc.tax_amount,
			total       = calc.total,
			late_fee_total = calc.late_fee_total,
			amount_paid = paid.amount_paid,
			-- A balance owing can never be negative: clamp at 0 so a stray overpayment (e.g. a
			-- duplicate capture) can't corrupt the ledger with a negative due. Overpayment is a
			-- Stripe-side refund/credit matter, not a negative receivable.
			amount_due  = GREATEST(calc.total - paid.amount_paid, 0),
			tip_total   = paid.tip_total,
			-- Strict Jobber status derivation (no 'partially_paid' — a part-paid invoice sits in
			-- awaiting_payment/past_due, the partial expressed via amount_paid). bad_debt (write-off)
			-- and draft are frozen; a Mark-Received close (received_at set) reads as paid.
			status = CASE
				WHEN invoices.status = 'bad_debt' THEN invoices.status
				WHEN invoices.status = 'draft' THEN invoices.status
				WHEN invoices.received_at IS NOT NULL THEN 'paid'
				WHEN paid.amount_paid >= calc.total AND paid.amount_paid > 0 THEN 'paid'
				WHEN calc.total <= 0 THEN invoices.status
				WHEN invoices.due_date IS NOT NULL AND invoices.due_date < CURRENT_DATE THEN 'past_due'
				WHEN paid.amount_paid > 0 THEN 'awaiting_payment'
				WHEN invoices.due_date IS NOT NULL AND invoices.due_date > CURRENT_DATE THEN 'sent_not_due'
				ELSE 'awaiting_payment'
			END,
			paid_at = CASE
				WHEN invoices.status = 'draft' THEN NULL
				WHEN paid.amount_paid >= calc.total
					AND paid.amount_paid > 0
					AND invoices.paid_at IS NULL
				THEN now()
				ELSE invoices.paid_at
			END,
			updated_at = now()
		FROM calc, paid
		WHERE invoices.id = ${invoiceId};
	`);
}

export function computeLineTotal(quantity: number, unit_price: number): string {
	return (Math.round(quantity * unit_price * 100) / 100).toFixed(2);
}
