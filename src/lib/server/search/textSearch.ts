// Shared text-search primitives for list/typeahead endpoints (Search Overhaul).
//
// One ranking + match contract reused by every searchable list so Contacts,
// Jobs, Quotes, Invoices, etc. all behave identically. Backed by the pg_trgm
// trigram indexes from migration 0079:
//   • `col ILIKE '%term%'`  → indexed substring ("contains") match
//   • `col % term`          → indexed trigram match (typo / fuzzy tolerance)
//
// Ranking uses an INTEGER bucket (not a float score) on purpose: it keeps
// keyset-cursor pagination deterministic across pages. Buckets, best first:
//   0  exact match on the primary field
//   1..N  prefix ("starts-with") match on each field, in the order given
//   N+1  everything else the WHERE clause allowed (substring or fuzzy hit)
// Within a bucket, callers tie-break by their existing stable order
// (created_at DESC, id DESC), so the bucket value is all the cursor must carry.
import { sql, type SQL, type AnyColumn } from 'drizzle-orm';

// Escape LIKE wildcards so a literal `%` or `_` typed by the user is matched
// verbatim instead of acting as a wildcard. Paired with `ESCAPE '\'` below.
function escapeLike(term: string): string {
	return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Normalize a raw search box value. Returns `null` when there is nothing
 * meaningful to search for, so callers can branch on "is this a search?".
 */
export function normalizeSearchTerm(raw: string | null | undefined): string | null {
	const trimmed = (raw ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * WHERE clause: rows where ANY field contains the term (indexed ILIKE) OR is a
 * close trigram match (indexed `%`, typo-tolerant). Callers OR this together
 * with any domain-specific clauses (e.g. exact phone match) before pushing it
 * into their `and(...conditions)`.
 *
 * `term` is the raw (already-trimmed) user input; lower-casing is unnecessary
 * because ILIKE and the trigram `%` operator are case-insensitive.
 */
export function textMatch(term: string, fields: AnyColumn[]): SQL {
	const like = `%${escapeLike(term)}%`;
	const clauses: SQL[] = [];
	for (const col of fields) {
		clauses.push(sql`${col} ILIKE ${like} ESCAPE '\\'`);
		clauses.push(sql`${col} % ${term}`);
	}
	return sql`(${sql.join(clauses, sql` OR `)})`;
}

/**
 * Relevance bucket expression (lower = better) for ORDER BY and the keyset
 * cursor. The FIRST field is treated as the primary one (gets the exact-match
 * bucket 0); every field then contributes a prefix bucket in order.
 */
export function textRank(term: string, fields: AnyColumn[]): SQL<number> {
	const lowered = term.toLowerCase();
	const prefix = `${escapeLike(lowered)}%`;
	const whenClauses: SQL[] = [];

	// Bucket 0: exact match on the primary field.
	const primary = fields[0];
	whenClauses.push(sql`WHEN lower(${primary}) = ${lowered} THEN 0`);

	// Buckets 1..N: prefix match on each field, in priority order.
	fields.forEach((col, i) => {
		whenClauses.push(sql`WHEN lower(${col}) LIKE ${prefix} ESCAPE '\\' THEN ${i + 1}`);
	});

	const elseBucket = fields.length + 1;
	return sql<number>`CASE ${sql.join(whenClauses, sql` `)} ELSE ${elseBucket} END`;
}
