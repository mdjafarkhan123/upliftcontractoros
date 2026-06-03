import { json } from '@sveltejs/kit';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	automationSettings,
	organizations,
	orgSmsCredit,
	outboxEvents,
	smsCreditLedger
} from '$lib/server/db/schema';
import { createOrgSchema, createOrganizationWithAdmin } from '$lib/server/admin/orgProvisioning';

export async function GET() {
	const rows = await db
		.select({
			id: organizations.id,
			name: organizations.name,
			slug: organizations.slug,
			status: organizations.status,
			trade_type: organizations.trade_type,
			is_setup_complete: organizations.is_setup_complete,
			created_at: organizations.created_at,
			google_review_link: automationSettings.google_review_link,
			last_known_review_count: organizations.last_known_review_count,
			last_review_check_at: organizations.last_review_check_at,
			sms_balance: orgSmsCredit.balance,
			sms_monthly_allowance: orgSmsCredit.monthly_included_credit
		})
		.from(organizations)
		.leftJoin(automationSettings, eq(automationSettings.org_id, organizations.id))
		.leftJoin(orgSmsCredit, eq(orgSmsCredit.org_id, organizations.id))
		.orderBy(desc(organizations.created_at));

	// Manual top-ups added in the current calendar month, summed per org — the
	// "+ ($x)" the PO sees next to balance / allowance on each org row.
	const topupRows = await db
		.select({
			org_id: smsCreditLedger.org_id,
			total: sql<string>`coalesce(sum(${smsCreditLedger.amount}), 0)`
		})
		.from(smsCreditLedger)
		.where(
			and(
				eq(smsCreditLedger.entry_type, 'manual_topup'),
				gte(smsCreditLedger.created_at, sql`date_trunc('month', now())`)
			)
		)
		.groupBy(smsCreditLedger.org_id);
	const topupByOrg = new Map(topupRows.map((r) => [r.org_id, Number(r.total)]));

	const orgs = rows.map((o) => ({
		...o,
		sms_balance: Number(o.sms_balance ?? 0),
		sms_monthly_allowance: Number(o.sms_monthly_allowance ?? 0),
		sms_topup_this_month: topupByOrg.get(o.id) ?? 0
	}));

	const deadLetters = await db
		.select({
			id: outboxEvents.id,
			org_id: outboxEvents.org_id,
			event_type: outboxEvents.event_type,
			last_error: outboxEvents.last_error,
			attempts: outboxEvents.attempts,
			dead_lettered_at: outboxEvents.dead_lettered_at
		})
		.from(outboxEvents)
		.where(eq(outboxEvents.status, 'dead_lettered'))
		.orderBy(desc(outboxEvents.dead_lettered_at));

	return json({ orgs, deadLetters });
}

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body.' }, { status: 400 });
	}

	const parsed = createOrgSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid form data.' },
			{ status: 400 }
		);
	}

	try {
		const { orgId } = await createOrganizationWithAdmin(parsed.data);
		return json({ orgId }, { status: 201 });
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Organization creation failed.' },
			{ status: 500 }
		);
	}
};
