/**
 * Cron 2 — Quote expiry sweep.
 *
 * Schedule: 30 2 * * * (UTC).
 * Purpose:  Flip eligible quotes to 'expired' and emit quote.expired ONLY for
 *           rows whose status actually transitioned during this run.
 * Idempotency:
 *   - UPDATE only matches sent/viewed rows past expires_at, so re-runs are
 *     no-ops once everything has flipped.
 *   - outbox_events.idempotency_key = `quote.expired:{quote_id}:{expires_at}` —
 *     keyed per validity cycle so a quote that is Extended (gets a NEW expires_at,
 *     status back to sent) can expire and notify again next time around.
 * Failure behavior:
 *   - Errors bubble to runGuarded() which catches, logs, and continues.
 */
import { inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { contacts } from '$lib/server/db/schema';
import { formatCurrencyUsd, formatQuoteNumber } from '$lib/server/quotes/format';
import type { CronJobResult } from './index';

type ExpiredRow = {
	id: string;
	org_id: string;
	contact_id: string;
	quote_number: number;
	total: string;
	expires_at: string | null;
	[key: string]: unknown;
};

export async function runQuoteExpirySweep(): Promise<CronJobResult> {
	return db.transaction(async (tx) => {
		const updated = await tx.execute<ExpiredRow>(sql`
			UPDATE quotes
			SET status = 'expired', updated_at = now()
			WHERE status IN ('sent', 'viewed')
				AND expires_at IS NOT NULL
				AND expires_at < now()
				AND deleted_at IS NULL
			RETURNING id, org_id, contact_id, quote_number, total, expires_at
		`);

		const rows = updated as unknown as ExpiredRow[];
		let processed = 0;

		// One batched lookup of customer names so the expiry notification can read
		// "Your quote to Sarah expired" without an N+1 per row.
		const nameById = new Map<string, string>();
		if (rows.length > 0) {
			const names = await tx
				.select({ id: contacts.id, full_name: contacts.full_name })
				.from(contacts)
				.where(
					inArray(
						contacts.id,
						rows.map((r) => r.contact_id)
					)
				);
			for (const n of names) nameById.set(n.id, n.full_name);
		}

		for (const q of rows) {
			const customerName = nameById.get(q.contact_id) ?? '';
			const quoteNumberDisplay = formatQuoteNumber(q.quote_number);
			const amountFormatted = formatCurrencyUsd(q.total);
			const payload = {
				quote_id: q.id,
				contact_id: q.contact_id,
				quote_number: q.quote_number,
				quote_number_display: quoteNumberDisplay,
				total: q.total,
				amount_formatted: amountFormatted,
				customer_name: customerName,
				expires_at: q.expires_at,
				summary: `Quote ${quoteNumberDisplay}${customerName ? ` to ${customerName}` : ''} expired`
			};

			await tx.execute(sql`
				INSERT INTO outbox_events (
					org_id, event_type, event_version, resource_type, resource_id,
					payload, idempotency_key
				) VALUES (
					${q.org_id}, 'quote.expired', 1, 'quote', ${q.id},
					${JSON.stringify(payload)}::jsonb,
					${`quote.expired:${q.id}:${q.expires_at}`}
				)
				ON CONFLICT (idempotency_key) DO NOTHING
			`);

			processed += 1;
		}

		return {
			scanned_count: rows.length,
			affected_count: rows.length,
			processed_count: processed,
			skipped_count: 0,
			error_count: 0
		};
	});
}
