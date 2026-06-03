import { json } from '@sveltejs/kit';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { getCurrentUsage, BYTES_PER_GB } from '$lib/server/usage/assertAndIncrementUsage';

type UsagePayload = {
	sms_sent: { current: number; max: number; period: 'monthly' };
	bulk_sms_sent: { current: number; max: number; period: 'daily' };
	ai_requests: { current: number; max: number; period: 'monthly' };
	storage_bytes: { current: number; max: number; period: 'lifetime' };
	team_members: { current: number; max: number; period: 'lifetime' };
};

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const [sms, bulkSms, ai, storage, teamCountRow] = await Promise.all([
		getCurrentUsage(db, auth.orgId, 'sms_sent'),
		getCurrentUsage(db, auth.orgId, 'bulk_sms_sent'),
		getCurrentUsage(db, auth.orgId, 'ai_requests'),
		getCurrentUsage(db, auth.orgId, 'storage_bytes'),
		db
			.select({ c: sql<number>`count(*)::int` })
			.from(orgMembers)
			.where(and(eq(orgMembers.org_id, auth.orgId), isNull(orgMembers.deleted_at)))
			.then((rows) => rows[0])
	]);

	const data: UsagePayload = {
		sms_sent: {
			current: sms,
			max: auth.limits.max_monthly_sms,
			period: 'monthly'
		},
		bulk_sms_sent: {
			current: bulkSms,
			max: auth.limits.max_bulk_sms_per_day,
			period: 'daily'
		},
		ai_requests: {
			current: ai,
			max: auth.limits.max_ai_requests_per_month,
			period: 'monthly'
		},
		storage_bytes: {
			current: storage,
			max: auth.limits.max_storage_gb * BYTES_PER_GB,
			period: 'lifetime'
		},
		team_members: {
			current: teamCountRow?.c ?? 0,
			max: auth.limits.max_team_members,
			period: 'lifetime'
		}
	};

	return json({ data });
};
