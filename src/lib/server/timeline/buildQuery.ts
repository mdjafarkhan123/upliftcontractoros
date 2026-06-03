import { sql, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import type { RawTimelineRow, TimelineCursor } from './types';

/**
 * Compound cursor ordering is non-negotiable:
 *   ORDER BY effective_at DESC, source_table DESC, row_id DESC
 *
 * The WHERE clause mirrors the same ordering using a row-constructor
 * comparison so pagination is deterministic even when multiple events
 * share an identical timestamp.
 *
 * `source_table` values are stable bucket identifiers (messages, quotes, …)
 * and are part of the public cursor contract — renaming them is breaking.
 * Multi-kind buckets (e.g. quotes can emit sent/viewed/accepted/declined for
 * a single quote row) keep `row_id` unique via a `:{kind}` suffix.
 */
export const TIMELINE_PAGE_SIZE = 50;

/**
 * Overfetch buffer. We always pull TIMELINE_FETCH_LIMIT rows from the union
 * and return at most TIMELINE_PAGE_SIZE. The headroom protects against:
 *   - mapper exceptions on malformed legacy data
 *   - future presentation filters layered on top
 * Without overfetch, post-processing skips would silently shrink each page.
 * Permission-gated branches (e.g. private_feedback) are excluded from the
 * union entirely rather than filtered post-mapping.
 */
export const TIMELINE_FETCH_LIMIT = 60;

export const TIMELINE_CATEGORIES = [
	'messages',
	'quotes',
	'invoices',
	'appointments',
	'jobs',
	'reviews',
	'notes',
	'automations'
] as const;
export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number];

export type BuildQueryParams = {
	orgId: string;
	contactId: string;
	cursor: TimelineCursor | null;
	includePrivateFeedback: boolean;
	/** Optional free-text filter. Already trimmed/length-capped by the route. */
	search?: string | null;
	/** Optional type filter. When set, only branches whose source_table matches are included. */
	types?: TimelineCategory[] | null;
};

/**
 * Escape the LIKE wildcards in user input so a literal `%`, `_`, or `\`
 * typed into the search box is matched literally rather than acting as a
 * pattern metacharacter. Values are still parameterized by the driver — this
 * is about pattern semantics, not injection.
 */
function escapeLike(term: string): string {
	return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

type SourceBranch = { sql: SQL; category: TimelineCategory };

function buildBranches(
	orgId: string,
	contactId: string,
	includePrivateFeedback: boolean
): SourceBranch[] {
	const branches: SourceBranch[] = [];

	// --- messages (inbound + outbound) ---
	branches.push({
		category: 'messages',
		sql: sql`
			select
				'messages'::text as source_table,
				m.id::text as row_id,
				m.created_at as effective_at,
				jsonb_build_object(
					'kind', 'in',
					'body', m.body,
					'conversation_id', m.conversation_id::text
				) as row_data
			from messages m
			join conversations c on c.id = m.conversation_id
			where c.org_id = ${orgId}
				and c.contact_id = ${contactId}
				and m.org_id = ${orgId}
				and m.direction = 'inbound'
				and m.is_internal_note = false
		`
	});

	branches.push({
		category: 'messages',
		sql: sql`
			select
				'messages'::text as source_table,
				m.id::text as row_id,
				m.created_at as effective_at,
				jsonb_build_object(
					'kind', 'out',
					'body', m.body,
					'conversation_id', m.conversation_id::text
				) as row_data
			from messages m
			join conversations c on c.id = m.conversation_id
			where c.org_id = ${orgId}
				and c.contact_id = ${contactId}
				and m.org_id = ${orgId}
				and m.direction = 'outbound'
				and m.is_internal_note = false
		`
	});

	// --- quotes: one branch per lifecycle event; row_id suffixed with :{kind}
	//     so the (source_table, row_id) pair stays unique across 4 events ---
	const quoteFields = sql`
		'quote_number', q.quote_number,
		'total', q.total::text,
		'quote_id', q.id::text
	`;

	branches.push({
		category: 'quotes',
		sql: sql`
			select 'quotes'::text as source_table,
				(q.id::text || ':sent') as row_id,
				q.sent_at as effective_at,
				jsonb_build_object('kind', 'sent', ${quoteFields}) as row_data
			from quotes q
			where q.org_id = ${orgId} and q.contact_id = ${contactId}
				and q.deleted_at is null and q.sent_at is not null
		`
	});
	branches.push({
		category: 'quotes',
		sql: sql`
			select 'quotes'::text as source_table,
				(q.id::text || ':viewed') as row_id,
				q.viewed_at as effective_at,
				jsonb_build_object('kind', 'viewed', ${quoteFields}) as row_data
			from quotes q
			where q.org_id = ${orgId} and q.contact_id = ${contactId}
				and q.deleted_at is null and q.viewed_at is not null
		`
	});
	branches.push({
		category: 'quotes',
		sql: sql`
			select 'quotes'::text as source_table,
				(q.id::text || ':accepted') as row_id,
				q.accepted_at as effective_at,
				jsonb_build_object('kind', 'accepted', ${quoteFields}) as row_data
			from quotes q
			where q.org_id = ${orgId} and q.contact_id = ${contactId}
				and q.deleted_at is null and q.accepted_at is not null
		`
	});
	branches.push({
		category: 'quotes',
		sql: sql`
			select 'quotes'::text as source_table,
				(q.id::text || ':declined') as row_id,
				q.declined_at as effective_at,
				jsonb_build_object('kind', 'declined', ${quoteFields}) as row_data
			from quotes q
			where q.org_id = ${orgId} and q.contact_id = ${contactId}
				and q.deleted_at is null and q.declined_at is not null
		`
	});

	// --- quote change requests: customer-requested edits, joined to quotes for contact filter ---
	branches.push({
		category: 'quotes',
		sql: sql`
			select 'quote_change_requests'::text as source_table,
				qcr.id::text as row_id,
				qcr.requested_at as effective_at,
				jsonb_build_object(
					'kind', 'requested',
					'quote_number', q.quote_number,
					'quote_id', q.id::text,
					'message', qcr.message
				) as row_data
			from quote_change_requests qcr
			join quotes q on q.id = qcr.quote_id
			where qcr.org_id = ${orgId}
				and q.contact_id = ${contactId}
				and q.deleted_at is null
		`
	});

	// --- invoices ---
	const invoiceFields = sql`
		'invoice_number', i.invoice_number,
		'total', i.total::text,
		'invoice_id', i.id::text
	`;

	branches.push({
		category: 'invoices',
		sql: sql`
			select 'invoices'::text as source_table,
				(i.id::text || ':sent') as row_id,
				i.sent_at as effective_at,
				jsonb_build_object('kind', 'sent', ${invoiceFields}) as row_data
			from invoices i
			where i.org_id = ${orgId} and i.contact_id = ${contactId}
				and i.deleted_at is null and i.sent_at is not null
		`
	});
	branches.push({
		category: 'invoices',
		sql: sql`
			select 'invoices'::text as source_table,
				(i.id::text || ':paid') as row_id,
				i.paid_at as effective_at,
				jsonb_build_object('kind', 'paid', ${invoiceFields}) as row_data
			from invoices i
			where i.org_id = ${orgId} and i.contact_id = ${contactId}
				and i.deleted_at is null and i.paid_at is not null
		`
	});

	// --- payments (financial immutability — no deleted_at on payments) ---
	branches.push({
		category: 'invoices',
		sql: sql`
			select
				'payments'::text as source_table,
				p.id::text as row_id,
				p.paid_at as effective_at,
				jsonb_build_object(
					'amount', p.amount::text,
					'payment_method', p.payment_method,
					'invoice_id', i.id::text
				) as row_data
			from payments p
			join invoices i on i.id = p.invoice_id
			where p.org_id = ${orgId} and i.contact_id = ${contactId}
		`
	});

	// --- appointments ---
	const apptFields = sql`
		'title', a.title,
		'scheduled_start', a.scheduled_start,
		'appointment_id', a.id::text
	`;

	branches.push({
		category: 'appointments',
		sql: sql`
			select 'appointments'::text as source_table,
				(a.id::text || ':scheduled') as row_id,
				a.created_at as effective_at,
				jsonb_build_object('kind', 'scheduled', ${apptFields}) as row_data
			from appointments a
			where a.org_id = ${orgId} and a.contact_id = ${contactId} and a.deleted_at is null
		`
	});

	// Appointments has no completed_at column today; fall back to updated_at
	// when status='completed'. Acceptable for v1 — revisit if a dedicated
	// timestamp is added in a later chapter.
	branches.push({
		category: 'appointments',
		sql: sql`
			select 'appointments'::text as source_table,
				(a.id::text || ':completed') as row_id,
				a.updated_at as effective_at,
				jsonb_build_object('kind', 'completed', ${apptFields}) as row_data
			from appointments a
			where a.org_id = ${orgId} and a.contact_id = ${contactId}
				and a.deleted_at is null and a.status = 'completed'
		`
	});

	branches.push({
		category: 'appointments',
		sql: sql`
			select 'appointments'::text as source_table,
				(a.id::text || ':cancelled') as row_id,
				a.cancelled_at as effective_at,
				jsonb_build_object('kind', 'cancelled', ${apptFields}) as row_data
			from appointments a
			where a.org_id = ${orgId} and a.contact_id = ${contactId}
				and a.deleted_at is null and a.cancelled_at is not null
		`
	});

	// --- jobs ---
	const jobFields = sql`'title', j.title, 'job_id', j.id::text`;

	branches.push({
		category: 'jobs',
		sql: sql`
			select 'jobs'::text as source_table,
				(j.id::text || ':created') as row_id,
				j.created_at as effective_at,
				jsonb_build_object('kind', 'created', ${jobFields}) as row_data
			from jobs j
			where j.org_id = ${orgId} and j.contact_id = ${contactId} and j.deleted_at is null
		`
	});
	branches.push({
		category: 'jobs',
		sql: sql`
			select 'jobs'::text as source_table,
				(j.id::text || ':completed') as row_id,
				j.completed_at as effective_at,
				jsonb_build_object('kind', 'completed', ${jobFields}) as row_data
			from jobs j
			where j.org_id = ${orgId} and j.contact_id = ${contactId}
				and j.deleted_at is null and j.completed_at is not null
		`
	});
	branches.push({
		category: 'jobs',
		sql: sql`
			select 'jobs'::text as source_table,
				(j.id::text || ':cancelled') as row_id,
				j.cancelled_at as effective_at,
				jsonb_build_object('kind', 'cancelled', ${jobFields}) as row_data
			from jobs j
			where j.org_id = ${orgId} and j.contact_id = ${contactId}
				and j.deleted_at is null and j.cancelled_at is not null
		`
	});

	// --- review requests ---
	branches.push({
		category: 'reviews',
		sql: sql`
			select
				'review_requests'::text as source_table,
				rr.id::text as row_id,
				rr.sent_at as effective_at,
				jsonb_build_object('kind', 'sent', 'job_id', rr.job_id::text) as row_data
			from review_requests rr
			where rr.org_id = ${orgId} and rr.contact_id = ${contactId}
				and rr.deleted_at is null and rr.sent_at is not null
		`
	});

	// --- reviews (immutable — no deleted_at) ---
	branches.push({
		category: 'reviews',
		sql: sql`
			select
				'reviews'::text as source_table,
				r.id::text as row_id,
				r.created_at as effective_at,
				jsonb_build_object(
					'score', r.score,
					'platform', r.platform,
					'job_id', r.job_id::text
				) as row_data
			from reviews r
			where r.org_id = ${orgId} and r.contact_id = ${contactId}
		`
	});

	// --- private feedback (permission-gated — branch skipped when hidden) ---
	if (includePrivateFeedback) {
		branches.push({
			category: 'reviews',
			sql: sql`
				select
					'private_feedback'::text as source_table,
					pf.id::text as row_id,
					pf.created_at as effective_at,
					jsonb_build_object('score', pf.score, 'job_id', pf.job_id::text) as row_data
				from private_feedback pf
				where pf.org_id = ${orgId} and pf.contact_id = ${contactId} and pf.deleted_at is null
			`
		});
	}

	// --- contact notes (with author join) ---
	branches.push({
		category: 'notes',
		sql: sql`
			select
				'notes'::text as source_table,
				n.id::text as row_id,
				n.created_at as effective_at,
				jsonb_build_object(
					'content', n.content,
					'author_id', n.author_id::text,
					'author_name', om.full_name
				) as row_data
			from contact_notes n
			left join org_members om on om.id = n.author_id
			where n.org_id = ${orgId} and n.contact_id = ${contactId} and n.deleted_at is null
		`
	});

	// --- customer-visible automations ---
	// Each automation type joins through its resource table to filter by contact_id.
	branches.push({
		category: 'automations',
		sql: sql`
			select
				'automations'::text as source_table,
				aj.id::text as row_id,
				coalesce(aj.completed_at, aj.created_at) as effective_at,
				jsonb_build_object(
					'kind', 'missed_call_textback',
					'resource_type', aj.resource_type,
					'resource_id', aj.resource_id::text
				) as row_data
			from automation_jobs aj
			join conversations c on c.id = aj.resource_id
			where aj.org_id = ${orgId}
				and aj.type = 'missed_call_textback'
				and aj.status = 'completed'
				and aj.resource_type = 'conversation'
				and c.contact_id = ${contactId}
		`
	});

	branches.push({
		category: 'automations',
		sql: sql`
			select
				'automations'::text as source_table,
				aj.id::text as row_id,
				coalesce(aj.completed_at, aj.created_at) as effective_at,
				jsonb_build_object(
					'kind', 'quote_followup',
					'resource_type', aj.resource_type,
					'resource_id', aj.resource_id::text
				) as row_data
			from automation_jobs aj
			join quotes q on q.id = aj.resource_id
			where aj.org_id = ${orgId}
				and aj.type = 'quote_followup'
				and aj.status = 'completed'
				and aj.resource_type = 'quote'
				and q.contact_id = ${contactId}
		`
	});

	branches.push({
		category: 'automations',
		sql: sql`
			select
				'automations'::text as source_table,
				aj.id::text as row_id,
				coalesce(aj.completed_at, aj.created_at) as effective_at,
				jsonb_build_object(
					'kind', 'invoice_reminder',
					'resource_type', aj.resource_type,
					'resource_id', aj.resource_id::text
				) as row_data
			from automation_jobs aj
			join invoices i on i.id = aj.resource_id
			where aj.org_id = ${orgId}
				and aj.type = 'invoice_reminder'
				and aj.status = 'completed'
				and aj.resource_type = 'invoice'
				and i.contact_id = ${contactId}
		`
	});

	return branches;
}

export async function fetchTimelineRows(params: BuildQueryParams): Promise<{
	rows: RawTimelineRow[];
	hasMore: boolean;
}> {
	const allBranches = buildBranches(params.orgId, params.contactId, params.includePrivateFeedback);

	const branches =
		params.types && params.types.length > 0
			? allBranches.filter((b) => params.types!.includes(b.category))
			: allBranches;

	if (branches.length === 0) return { rows: [], hasMore: false };

	const unionParts: SQL[] = branches.map((b) => sql`(${b.sql})`);
	const union = sql.join(unionParts, sql` union all `);

	const conditions: SQL[] = [];

	if (params.cursor) {
		conditions.push(
			sql`(effective_at, source_table, row_id) < (${new Date(params.cursor.effective_at)}::timestamptz, ${params.cursor.source_table}::text, ${params.cursor.row_id}::text)`
		);
	}

	// Free-text search. Match against the bucket name (so "quote"/"invoice"/
	// "payment"/"note" surface those event types) plus the human-readable text
	// already carried in row_data (message bodies, note content, quote/invoice
	// numbers, titles, etc.). Numeric/id fields are intentionally excluded to
	// avoid noisy false positives.
	const term = params.search?.trim();
	if (term) {
		const pattern = `%${escapeLike(term)}%`;
		conditions.push(sql`
			(
				source_table || ' ' ||
				coalesce(row_data->>'kind', '') || ' ' ||
				coalesce(row_data->>'body', '') || ' ' ||
				coalesce(row_data->>'content', '') || ' ' ||
				coalesce(row_data->>'message', '') || ' ' ||
				coalesce(row_data->>'quote_number', '') || ' ' ||
				coalesce(row_data->>'invoice_number', '') || ' ' ||
				coalesce(row_data->>'title', '') || ' ' ||
				coalesce(row_data->>'payment_method', '') || ' ' ||
				coalesce(row_data->>'platform', '')
			) ilike ${pattern}
		`);
	}

	const whereClause =
		conditions.length > 0 ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;

	const query = sql`
		with timeline as (
			${union}
		)
		select source_table, row_id, effective_at, row_data
		from timeline
		${whereClause}
		order by effective_at desc, source_table desc, row_id desc
		limit ${TIMELINE_FETCH_LIMIT + 1}
	`;

	const result = await db.execute<{
		source_table: string;
		row_id: string;
		effective_at: Date;
		row_data: Record<string, unknown>;
	}>(query);

	const all = result.map((r) => ({
		source_table: r.source_table,
		row_id: r.row_id,
		effective_at: r.effective_at instanceof Date ? r.effective_at : new Date(r.effective_at),
		row_data: r.row_data
	}));

	const hasMore = all.length > TIMELINE_FETCH_LIMIT;
	const rows = hasMore ? all.slice(0, TIMELINE_FETCH_LIMIT) : all;
	return { rows, hasMore };
}
