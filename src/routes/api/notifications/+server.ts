import { json } from '@sveltejs/kit';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { notifications } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

const PAGE_SIZE = 30;

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const items = await db
		.select()
		.from(notifications)
		.where(
			and(eq(notifications.org_id, auth.orgId), eq(notifications.member_id, auth.member.id))
		)
		.orderBy(desc(notifications.created_at))
		.limit(PAGE_SIZE);

	const [{ count }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(notifications)
		.where(
			and(
				eq(notifications.org_id, auth.orgId),
				eq(notifications.member_id, auth.member.id),
				isNull(notifications.read_at)
			)
		);

	return json({ data: { items, unread_count: count ?? 0 } });
};
