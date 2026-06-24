import { json, error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { quotes } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewAnyQuote } from '$lib/server/quotes/permissions';
import type { QuoteStats } from '$lib/types/quotes';

// Org-wide quote performance summary for the KPI strip above the quotes list.
// Read-only, computed in a single filtered-aggregate pass over the org's quotes.
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyQuote(auth.member)) error(403, 'Forbidden');

	const [row] = await db.execute<{
		open_value: string;
		awaiting_count: string;
		accepted_90: string;
		decided_90: string;
		avg_days_to_accept: string | null;
	}>(sql`
		SELECT
			COALESCE(
				SUM(${quotes.total}) FILTER (
					WHERE ${quotes.status} IN ('sent', 'viewed', 'changes_requested')
				), 0
			)::text AS open_value,
			COUNT(*) FILTER (
				WHERE ${quotes.status} IN ('sent', 'viewed')
			) AS awaiting_count,
			COUNT(*) FILTER (
				WHERE ${quotes.status} = 'accepted'
					AND ${quotes.accepted_at} >= now() - interval '90 days'
			) AS accepted_90,
			COUNT(*) FILTER (
				WHERE (${quotes.status} = 'accepted' AND ${quotes.accepted_at} >= now() - interval '90 days')
					OR (${quotes.status} = 'declined' AND ${quotes.declined_at} >= now() - interval '90 days')
					OR (${quotes.status} = 'expired' AND ${quotes.expires_at} >= now() - interval '90 days')
			) AS decided_90,
			AVG(EXTRACT(EPOCH FROM (${quotes.accepted_at} - ${quotes.sent_at})) / 86400.0) FILTER (
				WHERE ${quotes.status} = 'accepted'
					AND ${quotes.accepted_at} >= now() - interval '90 days'
					AND ${quotes.sent_at} IS NOT NULL
			) AS avg_days_to_accept
		FROM ${quotes}
		WHERE ${quotes.org_id} = ${auth.orgId}
			AND ${quotes.deleted_at} IS NULL
	`);

	const accepted90 = Number(row?.accepted_90 ?? 0);
	const decided90 = Number(row?.decided_90 ?? 0);

	const data: QuoteStats = {
		open_value: row?.open_value ?? '0',
		awaiting_count: Number(row?.awaiting_count ?? 0),
		acceptance_rate: decided90 > 0 ? accepted90 / decided90 : null,
		accepted_90: accepted90,
		decided_90: decided90,
		avg_days_to_accept: row?.avg_days_to_accept != null ? Number(row.avg_days_to_accept) : null
	};

	return json({ data });
};
