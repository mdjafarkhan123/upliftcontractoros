import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { quotes } from '$lib/server/db/schema';
import { formatQuoteNumber } from '$lib/server/quotes/format';

export type OpportunityQuoteRow = {
	id: string;
	quote_number_display: string;
	title: string;
	status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'changes_requested';
	total: string;
	created_at: string;
	sent_at: string | null;
	viewed_at: string | null;
};

export async function loadOpportunityQuotes(
	orgId: string,
	opportunityId: string,
	limit: number
): Promise<OpportunityQuoteRow[]> {
	const rows = await db
		.select({
			id: quotes.id,
			quote_number: quotes.quote_number,
			title: quotes.title,
			status: quotes.status,
			total: quotes.total,
			created_at: quotes.created_at,
			sent_at: quotes.sent_at,
			viewed_at: quotes.viewed_at
		})
		.from(quotes)
		.where(
			and(
				eq(quotes.org_id, orgId),
				eq(quotes.opportunity_id, opportunityId),
				isNull(quotes.deleted_at)
			)
		)
		.orderBy(desc(quotes.created_at))
		.limit(limit);

	return rows.map((r) => ({
		id: r.id,
		quote_number_display: formatQuoteNumber(r.quote_number),
		title: r.title,
		status: r.status,
		total: r.total,
		created_at: r.created_at.toISOString(),
		sent_at: r.sent_at ? r.sent_at.toISOString() : null,
		viewed_at: r.viewed_at ? r.viewed_at.toISOString() : null
	}));
}
