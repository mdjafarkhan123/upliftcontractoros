import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { messengerIntegrations } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { unsubscribePageFromApp } from '$lib/server/messenger/graph';

type MessengerStatusResponse = {
	is_connected: boolean;
	page_id: string | null;
	page_name: string | null;
	status: string | null;
	subscribed: boolean;
	connected_at: string | null;
};

/** Current Messenger connection state for the Settings → Integrations card. */
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');

	const [row] = await db
		.select({
			page_id: messengerIntegrations.page_id,
			page_name: messengerIntegrations.page_name,
			status: messengerIntegrations.status,
			subscribed: messengerIntegrations.subscribed,
			created_at: messengerIntegrations.created_at
		})
		.from(messengerIntegrations)
		.where(
			and(eq(messengerIntegrations.org_id, auth.orgId), isNull(messengerIntegrations.deleted_at))
		)
		.limit(1);

	const body: MessengerStatusResponse = {
		is_connected: !!row && row.status === 'connected',
		page_id: row?.page_id ?? null,
		page_name: row?.page_name ?? null,
		status: row?.status ?? null,
		subscribed: row?.subscribed ?? false,
		connected_at: row?.created_at?.toISOString() ?? null
	};
	return json({ data: body });
};

/**
 * Disconnect the Page: best-effort unsubscribe from Meta, then soft-delete the
 * row. The local row is the source of truth — a failed Graph unsubscribe (e.g.
 * a revoked token) must not block the contractor from disconnecting.
 */
export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');

	const [row] = await db
		.select({
			page_id: messengerIntegrations.page_id,
			page_access_token: messengerIntegrations.page_access_token
		})
		.from(messengerIntegrations)
		.where(
			and(eq(messengerIntegrations.org_id, auth.orgId), isNull(messengerIntegrations.deleted_at))
		)
		.limit(1);

	if (!row) return new Response(null, { status: 204 });

	try {
		await unsubscribePageFromApp(row.page_id, row.page_access_token);
	} catch (err) {
		console.warn(
			JSON.stringify({
				request_id: crypto.randomUUID(),
				org_id: auth.orgId,
				member_id: auth.member.id,
				route: 'DELETE /api/settings/messenger',
				reason: 'unsubscribe_failed_nonfatal',
				error_kind: err instanceof Error ? err.name : 'unknown'
			})
		);
	}

	const now = new Date();
	await db
		.update(messengerIntegrations)
		.set({ status: 'disconnected', subscribed: false, deleted_at: now, updated_at: now })
		.where(
			and(eq(messengerIntegrations.org_id, auth.orgId), isNull(messengerIntegrations.deleted_at))
		);

	return new Response(null, { status: 204 });
};
