import { json, error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { createLogger } from '$lib/server/log';
import type { DashboardSummary, DashboardPipelineStage } from '$lib/types/dashboard';
import {
	ACTIVITY_ALLOWLIST,
	buildActivityRow,
	type OutboxActivityRow
} from '$lib/server/dashboard/activityRegistry';

const log = createLogger('dashboard.summary');

const CACHE_TTL_MS = 5_000;
const ACTIVITY_LIMIT = 12;

/**
 * We overfetch outbox events on purpose. The query allowlists by event_type,
 * but the registry can still drop a row if `is_renderable` returns false
 * (e.g. payload missing required fields). Fetching > ACTIVITY_LIMIT gives
 * the slice headroom so a few skipped rows don't starve the feed.
 *
 * Do not "optimize" this to ACTIVITY_LIMIT — the feed will go sparse the
 * first time a producer ships a malformed payload.
 */
const ACTIVITY_FETCH_LIMIT = 30;

type CacheEntry = { data: DashboardSummary; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function cacheKey(orgId: string, memberId: string): string {
	return `${orgId}|${memberId}`;
}

async function safe<T>(
	label: string,
	fn: () => Promise<T>,
	fallback: T,
	degraded: string[]
): Promise<T> {
	try {
		return await fn();
	} catch (e) {
		log.error({
			query: label,
			reason: 'aggregate_query_failed',
			message: e instanceof Error ? e.message : String(e)
		});
		degraded.push(label);
		return fallback;
	}
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_view_dashboard) error(403, 'Forbidden');

	const orgId = auth.orgId;
	const tz = auth.org.timezone || 'America/Chicago';
	const memberId = auth.member.id;

	const key = cacheKey(orgId, memberId);
	const now = Date.now();
	const hit = cache.get(key);
	if (hit && hit.expiresAt > now) return json(hit.data);

	const canRevenue = auth.member.can_view_revenue === true;
	const canPipeline = auth.member.can_view_pipeline_snapshot === true;

	const degraded: string[] = [];

	const monthStart = sql`(date_trunc('month', (now() AT TIME ZONE ${tz}))) AT TIME ZONE ${tz}`;
	const dayStart = sql`(date_trunc('day', (now() AT TIME ZONE ${tz}))) AT TIME ZONE ${tz}`;
	const dayEnd = sql`((date_trunc('day', (now() AT TIME ZONE ${tz})) + interval '1 day')) AT TIME ZONE ${tz}`;
	const todayDate = sql`(now() AT TIME ZONE ${tz})::date`;

	const [leads, jobsWon, revenue, overdue, quotesAwaiting, jobsToday, pipeline, activityRows] =
		await Promise.all([
			// leads — new this month + conversion rate
			safe(
				'leads',
				async () => {
					const [row] = await db.execute<{ new_this_month: number; became_customer: number }>(sql`
						select
							count(*) filter (where created_at >= ${monthStart})::int as new_this_month,
							count(*) filter (where created_at >= ${monthStart} and status = 'customer')::int as became_customer
						from contacts
						where org_id = ${orgId} and deleted_at is null
					`);
					const n = row?.new_this_month ?? 0;
					const c = row?.became_customer ?? 0;
					return { new_this_month: n, conversion_rate: n > 0 ? c / n : null };
				},
				{ new_this_month: 0, conversion_rate: null as number | null },
				degraded
			),

			// jobs won this month
			safe(
				'jobs_won',
				async () => {
					const [row] = await db.execute<{ count: number; value: string }>(sql`
						select
							count(*)::int as count,
							coalesce(sum(o.value), 0)::text as value
						from opportunities o
						join pipeline_stages s on s.id = o.stage_id
						where o.org_id = ${orgId}
							and o.deleted_at is null
							and s.is_won = true
							and o.closed_at is not null
							and o.closed_at >= ${monthStart}
					`);
					return {
						count_this_month: row?.count ?? 0,
						value_this_month: row?.value ?? '0'
					};
				},
				{ count_this_month: 0, value_this_month: '0' },
				degraded
			),

			// revenue — payments-as-truth
			canRevenue
				? safe(
						'revenue',
						async () => {
							const [paidRow] = await db.execute<{ this_month: string }>(sql`
								select coalesce(sum(amount), 0)::text as this_month
								from payments
								where org_id = ${orgId}
									and paid_at >= ${monthStart}
							`);
							const [outRow] = await db.execute<{ outstanding: string }>(sql`
								select coalesce(sum(i.total) - coalesce(sum(p.paid), 0), 0)::text as outstanding
								from invoices i
								left join (
									select invoice_id, sum(amount) as paid
									from payments
									where org_id = ${orgId}
									group by invoice_id
								) p on p.invoice_id = i.id
								where i.org_id = ${orgId}
									and i.deleted_at is null
									and i.status in ('sent', 'partially_paid')
							`);
							return {
								this_month: paidRow?.this_month ?? '0',
								outstanding: outRow?.outstanding ?? '0'
							};
						},
						{ this_month: '0', outstanding: '0' },
						degraded
					)
				: Promise.resolve(null),

			// overdue invoices — derived
			safe(
				'overdue',
				async () => {
					const [row] = await db.execute<{ count: number; total: string }>(sql`
						select
							count(*)::int as count,
							coalesce(sum(i.amount_due), 0)::text as total
						from invoices i
						where i.org_id = ${orgId}
							and i.deleted_at is null
							and i.status in ('sent', 'partially_paid')
							and i.due_date is not null
							and i.due_date < ${todayDate}
					`);
					return { count: row?.count ?? 0, total: row?.total ?? '0' };
				},
				{ count: 0, total: '0' },
				degraded
			),

			// quotes awaiting — sent or viewed
			safe(
				'quotes_awaiting',
				async () => {
					const [row] = await db.execute<{ count: number }>(sql`
						select count(*)::int as count
						from quotes
						where org_id = ${orgId}
							and deleted_at is null
							and status in ('sent', 'viewed')
					`);
					return row?.count ?? 0;
				},
				0,
				degraded
			),

			// jobs scheduled today (org tz)
			safe(
				'jobs_today',
				async () => {
					const [row] = await db.execute<{ count: number }>(sql`
						select count(*)::int as count
						from jobs
						where org_id = ${orgId}
							and deleted_at is null
							and status in ('scheduled', 'in_progress')
							and scheduled_start is not null
							and scheduled_start >= ${dayStart}
							and scheduled_start < ${dayEnd}
					`);
					return row?.count ?? 0;
				},
				0,
				degraded
			),

			// pipeline snapshot — ordered by stage position
			canPipeline
				? safe(
						'pipeline',
						async () => {
							const rows = await db.execute<{
								stage_id: string;
								name: string;
								color: string;
								position: number;
								is_won: boolean;
								is_lost: boolean;
								count: number;
								value: string;
							}>(sql`
								select
									s.id as stage_id,
									s.name,
									s.color,
									s.position,
									s.is_won,
									s.is_lost,
									count(o.id) filter (where o.id is not null and o.deleted_at is null)::int as count,
									coalesce(sum(o.value) filter (where o.deleted_at is null), 0)::text as value
								from pipeline_stages s
								left join opportunities o on o.stage_id = s.id and o.org_id = s.org_id
								where s.org_id = ${orgId} and s.deleted_at is null
								group by s.id, s.name, s.color, s.position, s.is_won, s.is_lost
								order by s.position asc
							`);
							return rows as unknown as DashboardPipelineStage[];
						},
						[] as DashboardPipelineStage[],
						degraded
					)
				: Promise.resolve(null),

			// activity — read from outbox_events with explicit allowlist
			safe(
				'activity',
				async () => {
					const rows = await db.execute<OutboxActivityRow>(sql`
						select
							oe.id,
							oe.event_type,
							oe.resource_type,
							oe.resource_id,
							oe.payload,
							oe.created_at,
							c.full_name as contact_name
						from outbox_events oe
						left join contacts c
							on c.id = nullif(oe.payload->>'contact_id', '')::uuid
						where oe.org_id = ${orgId}
							and oe.event_type = any(${ACTIVITY_ALLOWLIST}::text[])
						order by oe.created_at desc
						limit ${ACTIVITY_FETCH_LIMIT}
					`);
					return rows;
				},
				[] as OutboxActivityRow[],
				degraded
			)
		]);

	const activity = activityRows
		.map(buildActivityRow)
		.filter((r): r is NonNullable<typeof r> => r !== null)
		.slice(0, ACTIVITY_LIMIT);

	const summary: DashboardSummary = {
		generated_at: new Date().toISOString(),
		timezone: tz,
		kpis: {
			leads,
			jobs_won: jobsWon,
			revenue: canRevenue ? revenue : null
		},
		attention: {
			overdue_invoices_count: overdue.count,
			overdue_invoices_total: overdue.total,
			quotes_awaiting_count: quotesAwaiting,
			jobs_today_count: jobsToday
		},
		pipeline_snapshot: canPipeline ? pipeline : null,
		recent_activity: activity,
		locks: {
			revenue_locked: !canRevenue,
			pipeline_locked: !canPipeline
		},
		degraded
	};

	cache.set(key, { data: summary, expiresAt: now + CACHE_TTL_MS });

	if (cache.size > 500) {
		const cutoff = now;
		for (const [k, v] of cache) if (v.expiresAt < cutoff) cache.delete(k);
	}

	return json(summary);
};
