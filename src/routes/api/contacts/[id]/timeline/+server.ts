import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, desc, lt, or, sql, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contactNotes, orgMembers, contacts } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

const PAGE_SIZE = 25;

/**
 * Timeline returns chronologically ordered events for a contact.
 *
 * Chapter 5 ships a single source (`contact_notes`) but the response shape and
 * compound cursor `(created_at, source_table, id)` are forward-compatible with
 * additional sources (messages, opportunities, quote events, etc.) which will
 * be unioned in later chapters.
 */
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_view_all_contacts) error(403, 'Forbidden');

	const [exists] = await db
		.select({ id: contacts.id })
		.from(contacts)
		.where(
			and(
				eq(contacts.org_id, auth.orgId),
				eq(contacts.id, event.params.id),
				isNull(contacts.deleted_at)
			)
		)
		.limit(1);
	if (!exists) error(404, 'Contact not found');

	const cursor = event.url.searchParams.get('cursor');
	// cursor: "<iso>|<source_table>|<id>"
	const conditions: SQL[] = [
		eq(contactNotes.org_id, auth.orgId),
		eq(contactNotes.contact_id, event.params.id),
		isNull(contactNotes.deleted_at)
	];

	if (cursor) {
		const [createdAt, source, id] = cursor.split('|');
		if (createdAt && id) {
			// Compound ordering: (created_at DESC, source_table ASC, id DESC).
			// Single-source today; preserved for forward compatibility.
			const clause = or(
				lt(contactNotes.created_at, new Date(createdAt)),
				and(
					eq(contactNotes.created_at, new Date(createdAt)),
					sql`'contact_notes' > ${source ?? ''}`
				),
				and(
					eq(contactNotes.created_at, new Date(createdAt)),
					sql`'contact_notes' = ${source ?? 'contact_notes'}`,
					lt(contactNotes.id, id)
				)
			);
			if (clause) conditions.push(clause);
		}
	}

	const rows = await db
		.select({
			id: contactNotes.id,
			content: contactNotes.content,
			author_id: contactNotes.author_id,
			author_name: orgMembers.full_name,
			created_at: contactNotes.created_at
		})
		.from(contactNotes)
		.leftJoin(orgMembers, eq(orgMembers.id, contactNotes.author_id))
		.where(and(...conditions))
		.orderBy(desc(contactNotes.created_at), desc(contactNotes.id))
		.limit(PAGE_SIZE + 1);

	const hasMore = rows.length > PAGE_SIZE;
	const items = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map((r) => ({
		id: r.id,
		source_table: 'contact_notes' as const,
		type: 'note' as const,
		created_at: r.created_at,
		data: {
			content: r.content,
			author_id: r.author_id,
			author_name: r.author_name
		}
	}));

	const last = items[items.length - 1];
	const nextCursor =
		hasMore && last ? `${last.created_at.toISOString()}|${last.source_table}|${last.id}` : null;

	return json({ items, next_cursor: nextCursor });
};
