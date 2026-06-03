import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { pushSubscriptions } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { sendPush } from '$lib/server/push/index';
import { NOTIFICATION_TYPES } from '$lib/notifications/types';
import type { NotificationType, PushPayload } from '$lib/notifications/types';
import { NOTIFICATION_SPEC } from '$lib/notifications/spec';

const schema = z.object({
	type: z.enum(NOTIFICATION_TYPES).optional()
});

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		body = {};
	}

	const parsed = schema.safeParse(body);
	const type: NotificationType =
		parsed.success && parsed.data.type ? parsed.data.type : 'message_received';

	const spec = NOTIFICATION_SPEC[type];

	const subs = await db
		.select({
			id: pushSubscriptions.id,
			endpoint: pushSubscriptions.endpoint,
			p256dh: pushSubscriptions.p256dh,
			auth: pushSubscriptions.auth
		})
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.member_id, auth.member.id));

	if (subs.length === 0) {
		return json({ error: 'No subscriptions found for this device' }, { status: 404 });
	}

	const testId = `test-${Date.now()}`;
	const payload: PushPayload = {
		v: 1,
		notification_id: testId,
		type,
		priority: spec.priority,
		route: spec.route('test'),
		resource_id: testId,
		title: `Test: ${spec.label}`,
		body: spec.description,
		require_interaction: false,
		metadata: {}
	};

	const expiredIds: string[] = [];
	let sent = 0;

	for (const sub of subs) {
		const result = await sendPush(sub.endpoint, sub.p256dh, sub.auth, payload);
		if ('ok' in result) {
			sent++;
		} else if ('expired' in result) {
			expiredIds.push(sub.id);
		}
	}

	if (expiredIds.length > 0) {
		await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, expiredIds));
	}

	return json({ data: { sent, expired: expiredIds.length } });
};
