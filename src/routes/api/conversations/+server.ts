import { json, error } from '@sveltejs/kit';
import { and, desc, eq, ilike, isNull, lt, or, type SQL, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, conversations, orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

const PAGE_SIZE = 30;

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!auth.member.can_view_all_conversations && !auth.member.can_view_assigned_conversations) {
		error(403, 'Forbidden');
	}

	const url = event.url;
	const filter = url.searchParams.get('filter') ?? 'all';
	const searchRaw = (url.searchParams.get('q') ?? '').trim();
	const cursor = url.searchParams.get('cursor');

	const conditions: SQL[] = [
		eq(conversations.org_id, auth.orgId),
		isNull(conversations.deleted_at)
	];

	if (!auth.member.can_view_all_conversations) {
		conditions.push(eq(conversations.assigned_to, auth.member.id));
	}

	if (filter === 'unread') {
		conditions.push(sql`${conversations.unread_count} > 0`);
	} else if (filter === 'sms') {
		conditions.push(eq(conversations.channel, 'sms'));
	} else if (filter === 'missed_calls') {
		conditions.push(eq(conversations.channel, 'missed_call'));
	}

	if (searchRaw.length > 0) {
		conditions.push(ilike(contacts.full_name, `%${searchRaw}%`));
	}

	if (cursor) {
		const [lastMsgAt, id] = cursor.split('|');
		if (lastMsgAt && id) {
			conditions.push(
				or(
					lt(conversations.last_message_at, new Date(lastMsgAt)),
					and(eq(conversations.last_message_at, new Date(lastMsgAt)), lt(conversations.id, id))
				) as SQL
			);
		}
	}

	const rows = await db
		.select({
			id: conversations.id,
			contact_id: conversations.contact_id,
			contact_name: contacts.full_name,
			contact_phone: contacts.phone,
			contact_sms_opt_out: contacts.sms_opt_out,
			channel: conversations.channel,
			status: conversations.status,
			assigned_to: conversations.assigned_to,
			assignee_name: orgMembers.full_name,
			last_message_at: conversations.last_message_at,
			unread_count: conversations.unread_count,
			created_at: conversations.created_at,
			last_message_body: sql<string | null>`(
				select m.body from messages m
				where m.conversation_id = ${conversations.id}
				  and m.is_internal_note = false
				order by m.created_at desc, m.id desc
				limit 1
			)`,
			last_message_direction: sql<'inbound' | 'outbound' | null>`(
				select m.direction from messages m
				where m.conversation_id = ${conversations.id}
				  and m.is_internal_note = false
				order by m.created_at desc, m.id desc
				limit 1
			)`
		})
		.from(conversations)
		.innerJoin(contacts, eq(contacts.id, conversations.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, conversations.assigned_to))
		.where(and(...conditions))
		.orderBy(desc(conversations.last_message_at), desc(conversations.id))
		.limit(PAGE_SIZE + 1);

	const hasMore = rows.length > PAGE_SIZE;
	const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
	const last = items[items.length - 1];
	const nextCursor =
		hasMore && last && last.last_message_at
			? `${last.last_message_at.toISOString()}|${last.id}`
			: null;

	return json({ data: { items, next_cursor: nextCursor } });
};
