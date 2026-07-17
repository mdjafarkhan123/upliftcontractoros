import { json, error } from '@sveltejs/kit';
import { sql, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { createLogger } from '$lib/server/log';
import type {
	DashboardSummary,
	DashboardPipelineStage,
	DashboardReputation,
	DashboardTodayJob
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

type Period = 'month' | 'year';

function cacheKey(orgId: string, memberId: string, period: Period): string {
	return `${orgId}|${memberId}|${period}`;
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

	// KPI-row time window. Only the flow KPIs (leads, jobs won, revenue) honour
	// this; balance cards and the other widgets stay month-based regardless.
	const period: Period = event.url.searchParams.get('period') === 'year' ? 'year' : 'month';

	const key = cacheKey(orgId, memberId, period);
	const now = Date.now();
	const hit = cache.get(key);
	if (hit && hit.expiresAt > now) return json(hit.data);

	const canRevenue = auth.member.can_view_revenue === true;
	const canPipeline = auth.member.can_view_pipeline_snapshot === true;
	const featureReviewFunnel = auth.org.feature_review_funnel === true;
	// Inbox visibility: full inbox (all) vs assigned-only. Drives unread scope.
	const canViewAllConversations = auth.member.can_view_all_conversations === true;
	const canViewAssignedConversations = auth.member.can_view_assigned_conversations === true;
	const canViewInbox = canViewAllConversations || canViewAssignedConversations;

	const degraded: string[] = [];

	const monthStart = sql`(date_trunc('month', (now() AT TIME ZONE ${tz}))) AT TIME ZONE ${tz}`;
	const lastMonthStart = sql`(date_trunc('month', (now() AT TIME ZONE ${tz}) - interval '1 month')) AT TIME ZONE ${tz}`;
	// Flow-KPI window: matches the requested period (month or year), with the
	// equivalent prior period for the trend chips.
	const trunc = period === 'year' ? 'year' : 'month';
	const periodStart = sql`(date_trunc(${trunc}, (now() AT TIME ZONE ${tz}))) AT TIME ZONE ${tz}`;
	const lastPeriodStart = sql`(date_trunc(${trunc}, (now() AT TIME ZONE ${tz}) - interval '1 ${sql.raw(trunc)}')) AT TIME ZONE ${tz}`;
	const dayStart = sql`(date_trunc('day', (now() AT TIME ZONE ${tz}))) AT TIME ZONE ${tz}`;
	const dayEnd = sql`((date_trunc('day', (now() AT TIME ZONE ${tz})) + interval '1 day')) AT TIME ZONE ${tz}`;
	const todayDate = sql`(now() AT TIME ZONE ${tz})::date`;

	const [
		leads,
		jobsWon,
		revenue,
		overdue,
		quotesAwaiting,
		agingLeads,
		todaySchedule,
		unreadConversations,
		missedCallRecovery,
		pipeline,
		reputation,
		activityRows
	] = await Promise.all([
		// leads — new this month + conversion rate
		safe(
			'leads',
			async () => {
				const [row] = await db.execute<{
					new_this_period: number;
					became_customer: number;
					new_last_period: number;
				}>(sql`
						select
							count(*) filter (where created_at >= ${periodStart})::int as new_this_period,
							count(*) filter (where created_at >= ${periodStart} and status = 'customer')::int as became_customer,
							count(*) filter (where created_at >= ${lastPeriodStart} and created_at < ${periodStart})::int as new_last_period
						from contacts
						where org_id = ${orgId} and deleted_at is null
					`);
				const n = row?.new_this_period ?? 0;
				const c = row?.became_customer ?? 0;
				return {
					new_this_period: n,
					conversion_rate: n > 0 ? c / n : null,
					new_last_period: row?.new_last_period ?? 0
				};
			},
			{ new_this_period: 0, conversion_rate: null as number | null, new_last_period: 0 },
			degraded
		),

		// jobs won this month
		safe(
			'jobs_won',
			async () => {
				const [row] = await db.execute<{
					count: number;
					value: string;
					count_last_period: number;
				}>(sql`
						select
							count(*) filter (where o.closed_at >= ${periodStart})::int as count,
							coalesce(sum(o.value) filter (where o.closed_at >= ${periodStart}), 0)::text as value,
							count(*) filter (where o.closed_at >= ${lastPeriodStart} and o.closed_at < ${periodStart})::int as count_last_period
						from opportunities o
						where o.org_id = ${orgId}
							and o.deleted_at is null
							and o.status = 'won'
							and o.closed_at is not null
							and o.closed_at >= ${lastPeriodStart}
					`);
				return {
					count_this_period: row?.count ?? 0,
					value_this_period: row?.value ?? '0',
					count_last_period: row?.count_last_period ?? 0
				};
			},
			{ count_this_period: 0, value_this_period: '0', count_last_period: 0 },
			degraded
		),

		// revenue — payments-as-truth
		canRevenue
			? safe(
					'revenue',
					async () => {
						// paid-revenue window and outstanding balance are independent — one wave.
						const [paidResult, outResult] = await Promise.all([
							db.execute<{ this_period: string; last_period: string }>(sql`
								select
									coalesce(sum(amount) filter (where paid_at >= ${periodStart}), 0)::text as this_period,
									coalesce(sum(amount) filter (where paid_at >= ${lastPeriodStart} and paid_at < ${periodStart}), 0)::text as last_period
								from payments
								where org_id = ${orgId}
									and paid_at >= ${lastPeriodStart}
							`),
							db.execute<{ outstanding: string }>(sql`
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
							`)
						]);
						const paidRow = paidResult[0];
						const outRow = outResult[0];
						return {
							this_period: paidRow?.this_period ?? '0',
							last_period: paidRow?.last_period ?? '0',
							outstanding: outRow?.outstanding ?? '0'
						};
					},
					{ this_period: '0', last_period: '0', outstanding: '0' },
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

		// quotes awaiting — sent or viewed (count + value on the table)
		safe(
			'quotes_awaiting',
			async () => {
				const [row] = await db.execute<{ count: number; total: string }>(sql`
						select
							count(*)::int as count,
							coalesce(sum(total), 0)::text as total
						from quotes
						where org_id = ${orgId}
							and deleted_at is null
							and status in ('sent', 'viewed')
					`);
				return { count: row?.count ?? 0, total: row?.total ?? '0' };
			},
			{ count: 0, total: '0' },
			degraded
		),

		// aging leads — leads with no activity (or never contacted) for 7+ days
		safe(
			'aging_leads',
			async () => {
				const [row] = await db.execute<{ count: number }>(sql`
						select count(*)::int as count
						from contacts
						where org_id = ${orgId}
							and deleted_at is null
							and status = 'lead'
							and coalesce(last_contacted_at, created_at) < (now() - interval '7 days')
					`);
				return row?.count ?? 0;
			},
			0,
			degraded
		),

		// today's schedule — scheduled/in-progress jobs starting today (org tz)
		safe(
			'today_schedule',
			async () => {
				const rows = await db.execute<DashboardTodayJob>(sql`
						select
							j.id,
							j.title,
							j.status,
							j.scheduled_start,
							j.scheduled_end,
							c.full_name as contact_name
						from jobs j
						left join contacts c on c.id = j.contact_id
						where j.org_id = ${orgId}
							and j.deleted_at is null
							and j.status in ('scheduled', 'in_progress')
							and j.scheduled_start is not null
							and j.scheduled_start >= ${dayStart}
							and j.scheduled_start < ${dayEnd}
						order by j.scheduled_start asc
						limit 8
					`);
				return rows as unknown as DashboardTodayJob[];
			},
			[] as DashboardTodayJob[],
			degraded
		),

		// unread conversations — permission-scoped (all inbox vs assigned-only)
		canViewInbox
			? safe(
					'unread_conversations',
					async () => {
						const assignedFilter =
							!canViewAllConversations && canViewAssignedConversations
								? sql`and assigned_to = ${memberId}`
								: sql``;
						const [row] = await db.execute<{ count: number }>(sql`
								select count(*)::int as count
								from conversations
								where org_id = ${orgId}
									and deleted_at is null
									and status = 'open'
									and unread_count > 0
									${assignedFilter}
							`);
						return row?.count ?? 0;
					},
					0,
					degraded
				)
			: Promise.resolve(0),

		// missed-call recovery — org-wide operational metric (full inbox only).
		// Missed call = inbound missed_call message this month. Recovered = its
		// conversation later got an inbound, non-missed_call reply (a real text-back).
		canViewAllConversations
			? safe(
					'missed_call_recovery',
					async () => {
						const [row] = await db.execute<{
							missed_count: number;
							recovered_count: number;
						}>(sql`
								with mc as (
									select m.id, m.conversation_id, m.created_at
									from messages m
									where m.org_id = ${orgId}
										and m.channel = 'missed_call'
										and m.direction = 'inbound'
										and m.created_at >= ${monthStart}
								)
								select
									count(*)::int as missed_count,
									count(*) filter (
										where exists (
											select 1
											from messages r
											where r.conversation_id = mc.conversation_id
												and r.org_id = ${orgId}
												and r.direction = 'inbound'
												and r.channel <> 'missed_call'
												and r.created_at > mc.created_at
										)
									)::int as recovered_count
								from mc
							`);
						return {
							missed_count: row?.missed_count ?? 0,
							recovered_count: row?.recovered_count ?? 0
						};
					},
					{ missed_count: 0, recovered_count: 0 },
					degraded
				)
			: Promise.resolve(null),

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
							count: number;
							value: string;
						}>(sql`
								select
									s.id as stage_id,
									s.name,
									s.color,
									s.position,
									count(o.id) filter (where o.id is not null and o.deleted_at is null and o.status = 'open')::int as count,
									coalesce(sum(o.value) filter (where o.deleted_at is null and o.status = 'open'), 0)::text as value
								from pipeline_stages s
								left join opportunities o on o.stage_id = s.id and o.org_id = s.org_id
								where s.org_id = ${orgId} and s.deleted_at is null
								group by s.id, s.name, s.color, s.position
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
						// review aggregates, funnel setting, and request count are independent — one wave.
						const [aggResult, settingsResult, reqResult] = await Promise.all([
							db.execute<{
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
							`),
							db.execute<{ review_funnel_enabled: boolean | null }>(sql`
								select review_funnel_enabled
								from automation_settings
								where org_id = ${orgId}
								limit 1
							`),
							db.execute<{ requests_this_month: number }>(sql`
								select count(*)::int as requests_this_month
								from review_requests
								where org_id = ${orgId}
									and deleted_at is null
									and created_at >= ${monthStart}
							`)
						]);
						const agg = aggResult[0];
						const settings = settingsResult[0];
						const reqRow = reqResult[0];
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
							and ${inArray(sql`ae.event_type`, ACTIVITY_ALLOWLIST)}
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
		period,
		kpis: {
			leads,
			jobs_won: jobsWon,
			revenue: canRevenue ? revenue : null
		},
		attention: {
			overdue_invoices_count: overdue.count,
			overdue_invoices_total: overdue.total,
			quotes_awaiting_count: quotesAwaiting.count,
			quotes_awaiting_total: quotesAwaiting.total,
			aging_leads_count: agingLeads,
			unread_conversations_count: unreadConversations
		},
		today_schedule: todaySchedule,
		missed_call_recovery: missedCallRecovery,
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
