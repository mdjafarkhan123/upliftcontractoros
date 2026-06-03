import { json, error } from '@sveltejs/kit';
import { and, eq, ilike, isNull, type SQL, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, conversations, messages, orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

const PAGE_SIZE = 30;

const STATUS_FILTERS = ['open', 'snoozed', 'closed'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number] | 'all';

function parseStatus(value: string | null): StatusFilter {
	if (value && (STATUS_FILTERS as readonly string[]).includes(value)) {
		return value as StatusFilter;
	}
	return 'open';
}

// Sort key: (unread_inbound, last_inbound_at, last_message_at, id) — all DESC, NULLS LAST.
// Cursor encodes the same tuple so pagination is stable across the composite order.
type Cursor = {
	u: 0 | 1;
	inboundAt: string | null;
	lastMsgAt: string | null;
	id: string;
};

function parseCursor(raw: string | null): Cursor | null {
	if (!raw) return null;
	const parts = raw.split('|');
	if (parts.length !== 4) return null;
	const [u, inboundAt, lastMsgAt, id] = parts;
	if (u !== '0' && u !== '1') return null;
	if (!id) return null;
	return {
		u: u === '1' ? 1 : 0,
		inboundAt: inboundAt || null,
		lastMsgAt: lastMsgAt || null,
		id
	};
}

function encodeCursor(c: Cursor): string {
	return `${c.u}|${c.inboundAt ?? ''}|${c.lastMsgAt ?? ''}|${c.id}`;
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!auth.member.can_view_all_conversations && !auth.member.can_view_assigned_conversations) {
		error(403, 'Forbidden');
	}

	const url = event.url;
	const status = parseStatus(url.searchParams.get('status'));
	const assignee = url.searchParams.get('assignee');
	const unread = url.searchParams.get('unread') === '1';
	const searchRaw = (url.searchParams.get('q') ?? '').trim();
	const tagRaw = url.searchParams.get('tag');
	const normalizedTag = tagRaw ? tagRaw.trim().toLowerCase().replace(/\s+/g, ' ') : null;
	const cursor = parseCursor(url.searchParams.get('cursor'));

	const unreadInboundExpr = sql<number>`(CASE WHEN ${conversations.unread_count} > 0 AND ${conversations.last_message_direction} = 'inbound' THEN 1 ELSE 0 END)`;

	const hasDeliveryFailureExpr = sql<boolean>`EXISTS (
		SELECT 1 FROM ${messages} m
		WHERE m.conversation_id = ${conversations.id}
			AND m.direction = 'outbound'
			AND m.is_internal_note = false
			AND m.status IN ('failed', 'bounced', 'undeliverable')
	)`;

	const conditions: SQL[] = [
		eq(conversations.org_id, auth.orgId),
		isNull(conversations.deleted_at)
	];

	if (status !== 'all') {
		conditions.push(eq(conversations.status, status));
	}

	if (!auth.member.can_view_all_conversations) {
		conditions.push(eq(conversations.assigned_to, auth.member.id));
	} else if (assignee === 'me') {
		conditions.push(eq(conversations.assigned_to, auth.member.id));
	} else if (assignee === 'unassigned') {
		conditions.push(isNull(conversations.assigned_to));
	} else if (assignee && assignee !== 'all') {
		conditions.push(eq(conversations.assigned_to, assignee));
	}

	if (unread) {
		conditions.push(sql`${conversations.unread_count} > 0`);
	}

	if (searchRaw.length > 0) {
		conditions.push(ilike(contacts.full_name, `%${searchRaw}%`));
	}

	if (normalizedTag) {
		conditions.push(sql`${conversations.tags} @> ARRAY[${normalizedTag}]::text[]`);
	}

	if (cursor) {
		// Strict lex compare of (u, last_inbound_at, last_message_at, id) under DESC NULLS LAST.
		// COALESCE to a far-past sentinel so NULL ranks last while staying comparable.
		const SENTINEL = '-infinity';
		const cUnread = cursor.u;
		const cInbound = cursor.inboundAt ?? SENTINEL;
		const cLastMsg = cursor.lastMsgAt ?? SENTINEL;
		const cId = cursor.id;
		const inboundCoalesced = sql`COALESCE(${conversations.last_inbound_at}, '-infinity'::timestamptz)`;
		const lastMsgCoalesced = sql`COALESCE(${conversations.last_message_at}, '-infinity'::timestamptz)`;
		conditions.push(
			sql`(
				${unreadInboundExpr} < ${cUnread}
				OR (${unreadInboundExpr} = ${cUnread} AND ${inboundCoalesced} < ${cInbound}::timestamptz)
				OR (${unreadInboundExpr} = ${cUnread} AND ${inboundCoalesced} = ${cInbound}::timestamptz AND ${lastMsgCoalesced} < ${cLastMsg}::timestamptz)
				OR (${unreadInboundExpr} = ${cUnread} AND ${inboundCoalesced} = ${cInbound}::timestamptz AND ${lastMsgCoalesced} = ${cLastMsg}::timestamptz AND ${conversations.id} < ${cId}::uuid)
			)`
		);
	}

	const rows = await db
		.select({
			id: conversations.id,
			contact_id: conversations.contact_id,
			contact_name: contacts.full_name,
			contact_phone: contacts.phone,
			contact_sms_opt_out: contacts.sms_opt_out,
			status: conversations.status,
			assigned_to: conversations.assigned_to,
			assignee_name: orgMembers.full_name,
			last_message_at: conversations.last_message_at,
			last_inbound_at: conversations.last_inbound_at,
			last_message_preview: conversations.last_message_preview,
			last_message_channel: conversations.last_message_channel,
			last_message_direction: conversations.last_message_direction,
			unread_count: conversations.unread_count,
			snoozed_until: conversations.snoozed_until,
			tags: conversations.tags,
			created_at: conversations.created_at,
			has_delivery_failure: hasDeliveryFailureExpr,
			unread_inbound: unreadInboundExpr
		})
		.from(conversations)
		.innerJoin(contacts, eq(contacts.id, conversations.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, conversations.assigned_to))
		.where(and(...conditions))
		.orderBy(
			sql`${unreadInboundExpr} DESC`,
			sql`${conversations.last_inbound_at} DESC NULLS LAST`,
			sql`${conversations.last_message_at} DESC NULLS LAST`,
			sql`${conversations.id} DESC`
		)
		.limit(PAGE_SIZE + 1);

	const hasMore = rows.length > PAGE_SIZE;
	const sliced = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
	const last = sliced[sliced.length - 1];
	const nextCursor =
		hasMore && last
			? encodeCursor({
					u: last.unread_inbound === 1 ? 1 : 0,
					inboundAt: last.last_inbound_at ? last.last_inbound_at.toISOString() : null,
					lastMsgAt: last.last_message_at ? last.last_message_at.toISOString() : null,
					id: last.id
				})
			: null;

	// Strip the helper column from the API response.
	const items = sliced.map(({ unread_inbound: _u, ...rest }) => rest);

	return json({ data: { items, next_cursor: nextCursor } });
};
