import { json, error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { createLogger } from '$lib/server/log';
import type {
	DashboardSummary,
	DashboardPipelineStage,
	DashboardReputation
} from '$lib/types/dashboard';
import {
	ACTIVITY_ALLOWLIST,
	buildActivityRow,
	type OutboxActivityRow
} from '$lib/server/dashboard/activityRegistry';
/**
 * Dashboard activity reads from activity_events (purpose-built feed table)
 * rather than outbox_events. Populated by the outbox worker on dispatch.
 * ACTIVITY_ALLOWLIST is still applied at query time as a defence-in-depth
 * filter (e.g. backfilled rows from event types since removed from registry).
 */

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
	const featureReviewFunnel = auth.org.feature_review_funnel === true;

	const degraded: string[] = [];

	const monthStart = sql`(date_trunc('month', (now() AT TIME ZONE ${tz}))) AT TIME ZONE ${tz}`;
	const dayStart = sql`(date_trunc('day', (now() AT TIME ZONE ${tz}))) AT TIME ZONE ${tz}`;
	const dayEnd = sql`((date_trunc('day', (now() AT TIME ZONE ${tz})) + interval '1 day')) AT TIME ZONE ${tz}`;
	const todayDate = sql`(now() AT TIME ZONE ${tz})::date`;

	const [
		leads,
		jobsWon,
		revenue,
		overdue,
		quotesAwaiting,
		jobsToday,
		pipeline,
		reputation,
		activityRows
	] = await Promise.all([
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

		// reputation — review funnel snapshot. Single try/catch covers both queries.
		featureReviewFunnel
			? safe(
					'reputation',
					async () => {
						const lastMonthStart = sql`(date_trunc('month', (now() AT TIME ZONE ${tz}) - interval '1 month')) AT TIME ZONE ${tz}`;
						const [agg] = await db.execute<{
							total_reviews: number;
							avg_rating: string | null;
							reviews_this_month: number;
							reviews_last_month: number;
						}>(sql`
								select
									count(*)::int as total_reviews,
									round(avg(score)::numeric, 1)::text as avg_rating,
									count(*) filter (where created_at >= ${monthStart})::int as reviews_this_month,
									count(*) filter (where created_at >= ${lastMonthStart} and created_at < ${monthStart})::int as reviews_last_month
								from reviews
								where org_id = ${orgId}
							`);
						const [settings] = await db.execute<{ review_funnel_enabled: boolean | null }>(sql`
								select review_funnel_enabled
								from automation_settings
								where org_id = ${orgId}
								limit 1
							`);
						const [reqRow] = await db.execute<{ requests_this_month: number }>(sql`
								select count(*)::int as requests_this_month
								from review_requests
								where org_id = ${orgId}
									and deleted_at is null
									and created_at >= ${monthStart}
							`);
						const result: DashboardReputation = {
							funnel_enabled: settings?.review_funnel_enabled === true,
							total_reviews: agg?.total_reviews ?? 0,
							avg_rating: agg?.avg_rating ? parseFloat(agg.avg_rating) : null,
							reviews_this_month: agg?.reviews_this_month ?? 0,
							reviews_last_month: agg?.reviews_last_month ?? 0,
							requests_this_month: reqRow?.requests_this_month ?? 0
						};
						return result;
					},
					null as DashboardReputation | null,
					degraded
				)
			: Promise.resolve<DashboardReputation>({
					funnel_enabled: false,
					total_reviews: 0,
					avg_rating: null,
					reviews_this_month: 0,
					reviews_last_month: 0,
					requests_this_month: 0
				}),

		// activity — read from activity_events with explicit allowlist
		safe(
			'activity',
			async () => {
				const rows = await db.execute<OutboxActivityRow>(sql`
						select
							ae.id,
							ae.event_type,
							ae.resource_type,
							ae.resource_id,
							ae.payload,
							ae.occurred_at as created_at,
							c.full_name as contact_name
						from activity_events ae
						left join contacts c
							on c.id = ae.contact_id
						where ae.org_id = ${orgId}
							and ae.event_type = any(${ACTIVITY_ALLOWLIST}::text[])
						order by ae.occurred_at desc
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
		reputation,
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
