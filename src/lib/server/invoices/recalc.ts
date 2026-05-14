import { sql } from 'drizzle-orm';
import type { db as DbClient } from '$lib/server/db/client';

type Tx = Parameters<Parameters<typeof DbClient.transaction>[0]>[0];

/**
 * Recalculate invoice subtotal/tax/total from non-deleted line items,
 * and amount_paid/amount_due from immutable payments.
 * Caller MUST hold a row lock on the invoice (SELECT ... FOR UPDATE) before calling.
 * Updates status to 'paid' or 'partially_paid' and sets paid_at when balance hits zero.
 */
export async function recalcInvoiceTotals(tx: Tx, invoiceId: string): Promise<void> {
	await tx.execute(sql`
		WITH lines AS (
			SELECT COALESCE(SUM(total), 0)::numeric(12,2) AS subtotal
			FROM invoice_line_items
			WHERE invoice_id = ${invoiceId} AND deleted_at IS NULL
		),
		paid AS (
			SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS amount_paid
			FROM payments
			WHERE invoice_id = ${invoiceId}
		)
		UPDATE invoices
		SET
			subtotal    = lines.subtotal,
			tax_amount  = ROUND(lines.subtotal * invoices.tax_rate, 2),
			total       = ROUND(lines.subtotal + (lines.subtotal * invoices.tax_rate), 2),
			amount_paid = paid.amount_paid,
			amount_due  = ROUND(lines.subtotal + (lines.subtotal * invoices.tax_rate), 2) - paid.amount_paid,
			status = CASE
				WHEN invoices.status = 'cancelled' THEN invoices.status
				WHEN invoices.status = 'draft' THEN invoices.status
				WHEN paid.amount_paid >= ROUND(lines.subtotal + (lines.subtotal * invoices.tax_rate), 2)
					AND paid.amount_paid > 0 THEN 'paid'
				WHEN paid.amount_paid > 0 THEN 'partially_paid'
				ELSE invoices.status
			END,
			paid_at = CASE
				WHEN paid.amount_paid >= ROUND(lines.subtotal + (lines.subtotal * invoices.tax_rate), 2)
					AND paid.amount_paid > 0
					AND invoices.paid_at IS NULL
				THEN now()
				ELSE invoices.paid_at
			END,
			updated_at = now()
		FROM lines, paid
		WHERE invoices.id = ${invoiceId};
	`);
}

export function computeLineTotal(quantity: number, unit_price: number): string {
	return (Math.round(quantity * unit_price * 100) / 100).toFixed(2);
}
