import { json, error } from '@sveltejs/kit';
import { sql, desc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { smsCreditLedger } from '$lib/server/db/schema';
import { getCreditState } from '$lib/server/sms/credit';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

// Admin-only, read-only SMS credit + usage snapshot for the requester's own org.
// Contractors never configure pricing/allowance (PO-only via /jafar). The per-SMS
// price + "messages remaining" are exposed ONLY when the PO has flipped
// org_sms_credit.show_cost_to_contractor for this org — otherwise those keys are
// omitted entirely so the price can never leak to the client.
// Auth: /api/* is session-guarded in hooks.server.ts; org scoping via locals.auth.
function assertAdmin(role: string): void {
	if (role !== 'admin') error(403, 'Admin only.');
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	const credit = await getCreditState(db, auth.orgId);
	if (!credit)
		return json({ error: 'No SMS credit account for this organization.' }, { status: 404 });

	// Outbound SMS usage counts. Single pass with FILTER aggregates. 'sent' and
	// 'delivered' both mean the message left for Twilio; failed/undeliverable/
	// bounced never went out.
	const usageRows = await db.execute<{
		sent_all_time: number;
		sent_this_month: number;
		delivered: number;
		failed: number;
	}>(sql`
		SELECT
			count(*) FILTER (WHERE status IN ('sent', 'delivered'))::int AS sent_all_time,
			count(*) FILTER (
				WHERE status IN ('sent', 'delivered')
				AND created_at >= date_trunc('month', now())
			)::int AS sent_this_month,
			count(*) FILTER (WHERE status = 'delivered')::int AS delivered,
			count(*) FILTER (WHERE status IN ('failed', 'undeliverable', 'bounced'))::int AS failed
		FROM messages
		WHERE org_id = ${auth.orgId}
			AND channel = 'sms'
			AND direction = 'outbound'
	`);
	const u = (usageRows as unknown as Array<Record<string, number>>)[0];

	const ledger = await db
		.select({
			id: smsCreditLedger.id,
			entry_type: smsCreditLedger.entry_type,
			amount: smsCreditLedger.amount,
			balance_after: smsCreditLedger.balance_after,
			note: smsCreditLedger.note,
			created_at: smsCreditLedger.created_at
		})
		.from(smsCreditLedger)
		.where(eq(smsCreditLedger.org_id, auth.orgId))
		.orderBy(desc(smsCreditLedger.created_at))
		.limit(15);

	const lowCredit =
		credit.monthly_included_credit > 0 && credit.balance < credit.monthly_included_credit * 0.2;

	return json({
		data: {
			balance: credit.balance.toFixed(2),
			monthly_included_credit: credit.monthly_included_credit.toFixed(2),
			last_monthly_grant_at: credit.last_monthly_grant_at
				? credit.last_monthly_grant_at.toISOString()
				: null,
			low_credit: lowCredit,
			// Cost surfaced only when the PO opted this org in — otherwise omitted.
			show_cost: credit.show_cost_to_contractor,
			...(credit.show_cost_to_contractor
				? {
						per_sms_cost: credit.per_sms_cost.toFixed(4),
						messages_remaining:
							credit.per_sms_cost > 0 ? Math.floor(credit.balance / credit.per_sms_cost) : null
					}
				: {}),
			usage: {
				sent_this_month: u?.sent_this_month ?? 0,
				sent_all_time: u?.sent_all_time ?? 0,
				delivered: u?.delivered ?? 0,
				failed: u?.failed ?? 0
			},
			ledger
		}
	});
};
