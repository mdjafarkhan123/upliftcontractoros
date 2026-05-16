/**
 * Cron 5 — Monthly growth summary.
 *
 * Schedule: 0 6 1 * * (1st of month, 06:00 UTC).
 * Purpose:  For each active org, insert a growth_feed_items row summarizing
 *           the PREVIOUS calendar month in UTC. Metrics aggregate strictly
 *           [prev_month_start_utc, prev_month_end_utc] — never a rolling
 *           30-day window.
 * Idempotency:
 *   - Partial unique index idx_growth_feed_monthly_summary_unique on
 *     (org_id, summary_year, summary_month) WHERE is_monthly_summary = TRUE
 *     guarantees at most one summary per org per month.
 *   - INSERT uses ON CONFLICT DO NOTHING so re-runs are no-ops.
 * Failure behavior:
 *   - Per-org failure is caught and counted; the loop continues for other
 *     orgs. Outer error escapes to runGuarded().
 */
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { createLogger } from '$lib/server/log';
import type { CronJobResult } from './index';

const log = createLogger('cron.monthly-summary');

function previousMonthRangeUtc(now: Date): {
	start: Date;
	end: Date;
	month: number;
	year: number;
} {
	const y = now.getUTCFullYear();
	const m = now.getUTCMonth(); // 0-11; previous month index
	const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
	const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)); // exclusive upper bound
	return {
		start,
		end,
		month: start.getUTCMonth() + 1, // 1-12
		year: start.getUTCFullYear()
	};
}

interface Aggregates {
	reviews_received: number;
	avg_review_score: number | null;
	leads_created: number;
	revenue_collected: string;
	growth_items_published: number;
}

export async function runMonthlyGrowthSummary(): Promise<CronJobResult> {
	const { start, end, month, year } = previousMonthRangeUtc(new Date());

	const orgs = await db.execute<{ id: string; name: string }>(sql`
		SELECT id, name FROM organizations
		WHERE status = 'active' AND deleted_at IS NULL
	`);
	const orgRows = orgs as unknown as { id: string; name: string }[];

	let processed = 0;
	let skipped = 0;
	let errors = 0;

	for (const org of orgRows) {
		try {
			const aggResult = await db.execute<{
				reviews_received: number;
				avg_review_score: string | null;
				leads_created: number;
				revenue_collected: string;
				growth_items_published: number;
			}>(sql`
				SELECT
					(SELECT COUNT(*)::int FROM reviews
						WHERE org_id = ${org.id}
							AND created_at >= ${start.toISOString()}
							AND created_at < ${end.toISOString()}
					) AS reviews_received,
					(SELECT AVG(score)::numeric FROM reviews
						WHERE org_id = ${org.id}
							AND created_at >= ${start.toISOString()}
							AND created_at < ${end.toISOString()}
					) AS avg_review_score,
					(SELECT COUNT(*)::int FROM contacts
						WHERE org_id = ${org.id}
							AND created_at >= ${start.toISOString()}
							AND created_at < ${end.toISOString()}
							AND deleted_at IS NULL
					) AS leads_created,
					(SELECT COALESCE(SUM(amount), 0)::numeric FROM payments
						WHERE org_id = ${org.id}
							AND paid_at >= ${start.toISOString()}
							AND paid_at < ${end.toISOString()}
					) AS revenue_collected,
					(SELECT COUNT(*)::int FROM growth_feed_items
						WHERE org_id = ${org.id}
							AND is_monthly_summary = FALSE
							AND published_at >= ${start.toISOString()}
							AND published_at < ${end.toISOString()}
					) AS growth_items_published
			`);

			const aggArr = aggResult as unknown as Array<{
				reviews_received: number;
				avg_review_score: string | null;
				leads_created: number;
				revenue_collected: string;
				growth_items_published: number;
			}>;
			const agg = aggArr[0];

			const summary: Aggregates = {
				reviews_received: agg.reviews_received,
				avg_review_score: agg.avg_review_score === null ? null : Number(agg.avg_review_score),
				leads_created: agg.leads_created,
				revenue_collected: agg.revenue_collected,
				growth_items_published: agg.growth_items_published
			};

			const monthLabel = start.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
			const title = `${monthLabel} ${year} Summary`;
			const body = JSON.stringify(summary);

			const inserted = await db.execute<{ id: string }>(sql`
				INSERT INTO growth_feed_items (
					org_id, type, title, body, is_monthly_summary,
					summary_month, summary_year, published_at
				) VALUES (
					${org.id}, 'monthly_summary', ${title}, ${body}, TRUE,
					${month}, ${year}, now()
				)
				ON CONFLICT (org_id, summary_year, summary_month)
				WHERE is_monthly_summary = TRUE
				DO NOTHING
				RETURNING id
			`);
			const insertedRows = inserted as unknown as { id: string }[];
			if (insertedRows.length > 0) processed += 1;
			else skipped += 1;
		} catch (err) {
			errors += 1;
			const message = err instanceof Error ? err.message : String(err);
			log.error({
				org_id: org.id,
				summary_month: month,
				summary_year: year,
				error: message
			});
		}
	}

	return {
		scanned_count: orgRows.length,
		affected_count: processed,
		processed_count: processed,
		skipped_count: skipped,
		error_count: errors,
		summary_month: month,
		summary_year: year
	};
}
