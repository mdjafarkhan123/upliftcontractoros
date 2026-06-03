import { json, error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

const LIMIT = 20;

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!auth.member.can_view_all_conversations && !auth.member.can_view_assigned_conversations) {
		error(403, 'Forbidden');
	}

	const rawQ = (event.url.searchParams.get('q') ?? '').trim();
	if (rawQ.length < 3) {
		return json({ data: { items: [] } });
	}

	const canViewAll = auth.member.can_view_all_conversations;
	const memberId = auth.member.id;
	const orgId = auth.orgId;

	const rows = await db.execute(sql`
		WITH ranked AS (
			SELECT
				m.conversation_id,
				m.body        AS matched_body,
				m.created_at  AS matched_at,
				ROW_NUMBER() OVER (
					PARTITION BY m.conversation_id
					ORDER BY m.created_at DESC
				) AS rn
			FROM messages m
			WHERE m.org_id = ${orgId}
				AND m.search_vector @@ plainto_tsquery('english', ${rawQ})
				AND (
					${canViewAll}::boolean = true
					OR EXISTS (
						SELECT 1
						FROM conversations c2
						WHERE c2.id = m.conversation_id
							AND c2.assigned_to = ${memberId}
					)
				)
		)
		SELECT
			c.id,
			c.contact_id,
			c.status,
			c.unread_count,
			c.last_message_at,
			c.assigned_to,
			ct.full_name AS contact_name,
			ct.phone AS contact_phone,
			r.matched_body,
			r.matched_at
		FROM ranked r
		JOIN conversations c ON c.id = r.conversation_id
		JOIN contacts ct ON ct.id = c.contact_id
		WHERE r.rn = 1
			AND c.deleted_at IS NULL
		ORDER BY r.matched_at DESC
		LIMIT ${LIMIT}
	`);

	const items = (
		(rows as unknown as { rows?: Record<string, unknown>[] }).rows ??
		(Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [])
	).map((r) => ({
		id: r.id as string,
		contact_id: r.contact_id as string,
		contact_name: r.contact_name as string,
		contact_phone: r.contact_phone as string,
		status: r.status as string,
		unread_count: Number(r.unread_count ?? 0),
		last_message_at: r.last_message_at as string | null,
		assigned_to: r.assigned_to as string | null,
		matched_body: r.matched_body as string | null,
		matched_at: r.matched_at as string
	}));

	return json({ data: { items } });
};
