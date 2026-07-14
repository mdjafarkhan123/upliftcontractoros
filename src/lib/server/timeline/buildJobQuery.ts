import { sql, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import type { RawTimelineRow, TimelineCursor } from './types';
import { TIMELINE_FETCH_LIMIT } from './buildQuery';

/**
 * Job activity timeline (Jobber "Activity feed" pattern).
 *
 * A narrower sibling of the contact timeline (buildQuery.ts): instead of every
 * event tied to a contact, this pulls only the events tied to ONE job — its
 * lifecycle, its calendar visits, the invoices/payments it produced, and the
 * review flow it kicked off. Photos are intentionally excluded (they have their
 * own gallery on the job page, matching Jobber).
 *
 * Rows reuse the exact same (source_table, kind) contract as the contact
 * timeline, so the shared registry mappers (mappers/jobs.ts, appointments.ts,
 * invoices.ts, payments.ts, review_requests.ts, reviews.ts) render them verbatim
 * with no new mapper code.
 *
 * Ordering + cursor semantics are identical to the contact timeline:
 *   ORDER BY effective_at DESC, source_table DESC, row_id DESC
 * with a row-constructor comparison for deterministic pagination.
 */

export const JOB_TIMELINE_CATEGORIES = ['jobs', 'appointments', 'invoices', 'reviews'] as const;
export type JobTimelineCategory = (typeof JOB_TIMELINE_CATEGORIES)[number];

export type BuildJobQueryParams = {
	orgId: string;
	jobId: string;
	cursor: TimelineCursor | null;
	includePrivateFeedback: boolean;
	/** Optional free-text filter. Already trimmed/length-capped by the route. */
	search?: string | null;
	/** Optional type filter. When set, only branches whose category matches are included. */
	types?: JobTimelineCategory[] | null;
};

/**
 * Escape LIKE wildcards so a literal `%`, `_`, or `\` typed into search is
 * matched literally. Values are still driver-parameterized — this is about
 * pattern semantics, not injection.
 */
function escapeLike(term: string): string {
	return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

type SourceBranch = { sql: SQL; category: JobTimelineCategory };

function buildBranches(
	orgId: string,
	jobId: string,
	includePrivateFeedback: boolean
): SourceBranch[] {
	const branches: SourceBranch[] = [];

	// --- job lifecycle (created / completed / cancelled) ---
	const jobFields = sql`'title', j.title, 'job_id', j.id::text`;

	branches.push({
		category: 'jobs',
		sql: sql`
			select 'jobs'::text as source_table,
				(j.id::text || ':created') as row_id,
				j.created_at as effective_at,
				jsonb_build_object('kind', 'created', ${jobFields}) as row_data
			from jobs j
			where j.org_id = ${orgId} and j.id = ${jobId} and j.deleted_at is null
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
			where j.org_id = ${orgId} and j.id = ${jobId}
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
			where j.org_id = ${orgId} and j.id = ${jobId}
				and j.deleted_at is null and j.cancelled_at is not null
		`
	});

	// --- visits (appointments linked to this job) ---
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
			where a.org_id = ${orgId} and a.job_id = ${jobId} and a.deleted_at is null
		`
	});
	// No completed_at column on appointments today — fall back to updated_at when
	// status='completed' (mirrors the contact timeline).
	branches.push({
		category: 'appointments',
		sql: sql`
			select 'appointments'::text as source_table,
				(a.id::text || ':completed') as row_id,
				a.updated_at as effective_at,
				jsonb_build_object('kind', 'completed', ${apptFields}) as row_data
			from appointments a
			where a.org_id = ${orgId} and a.job_id = ${jobId}
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
			where a.org_id = ${orgId} and a.job_id = ${jobId}
				and a.deleted_at is null and a.cancelled_at is not null
		`
	});

	// --- invoices generated from this job ---
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
			where i.org_id = ${orgId} and i.job_id = ${jobId}
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
			where i.org_id = ${orgId} and i.job_id = ${jobId}
				and i.deleted_at is null and i.paid_at is not null
		`
	});

	// --- payments against this job's invoices (immutable — no deleted_at) ---
	branches.push({
		category: 'invoices',
		sql: sql`
			select 'payments'::text as source_table,
				p.id::text as row_id,
				p.paid_at as effective_at,
				jsonb_build_object(
					'amount', p.amount::text,
					'payment_method', p.payment_method,
					'invoice_id', i.id::text
				) as row_data
			from payments p
			join invoices i on i.id = p.invoice_id
			where p.org_id = ${orgId} and i.job_id = ${jobId}
		`
	});

	// --- review request sent for this job ---
	branches.push({
		category: 'reviews',
		sql: sql`
			select 'review_requests'::text as source_table,
				rr.id::text as row_id,
				rr.sent_at as effective_at,
				jsonb_build_object('kind', 'sent', 'job_id', rr.job_id::text) as row_data
			from review_requests rr
			where rr.org_id = ${orgId} and rr.job_id = ${jobId}
				and rr.deleted_at is null and rr.sent_at is not null
		`
	});

	// --- reviews received for this job (immutable — no deleted_at) ---
	branches.push({
		category: 'reviews',
		sql: sql`
			select 'reviews'::text as source_table,
				r.id::text as row_id,
				r.created_at as effective_at,
				jsonb_build_object(
					'score', r.score,
					'platform', r.platform,
					'job_id', r.job_id::text
				) as row_data
			from reviews r
			where r.org_id = ${orgId} and r.job_id = ${jobId}
		`
	});

	// --- private feedback (permission-gated — branch skipped when hidden) ---
	if (includePrivateFeedback) {
		branches.push({
			category: 'reviews',
			sql: sql`
				select 'private_feedback'::text as source_table,
					pf.id::text as row_id,
					pf.created_at as effective_at,
					jsonb_build_object('score', pf.score, 'job_id', pf.job_id::text) as row_data
				from private_feedback pf
				where pf.org_id = ${orgId} and pf.job_id = ${jobId} and pf.deleted_at is null
			`
		});
	}

	return branches;
}

export async function fetchJobTimelineRows(params: BuildJobQueryParams): Promise<{
	rows: RawTimelineRow[];
	hasMore: boolean;
}> {
	const allBranches = buildBranches(params.orgId, params.jobId, params.includePrivateFeedback);

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

	const term = params.search?.trim();
	if (term) {
		const pattern = `%${escapeLike(term)}%`;
		conditions.push(sql`
			(
				source_table || ' ' ||
				coalesce(row_data->>'kind', '') || ' ' ||
				coalesce(row_data->>'invoice_number', '') || ' ' ||
				coalesce(row_data->>'title', '') || ' ' ||
				coalesce(row_data->>'payment_method', '') || ' ' ||
				coalesce(row_data->>'platform', '')
			) ilike ${pattern}
		`);
	}

	const whereClause = conditions.length > 0 ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;

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
