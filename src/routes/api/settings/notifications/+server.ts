import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { memberNotificationPreferences } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { NOTIFICATION_SPEC } from '$lib/notifications/spec';
import { NOTIFICATION_TYPES } from '$lib/notifications/types';
import type { NotificationType } from '$lib/notifications/types';
import { preferencesForMember } from '$lib/server/notifications/preferences';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const types = [...NOTIFICATION_TYPES] as NotificationType[];
	const prefsMap = await preferencesForMember(auth.member.id, types);

	const data = types.map((type) => {
		const spec = NOTIFICATION_SPEC[type];
		const pref = prefsMap.get(type);
		const defaultOn = spec.priority !== 'silent';
		return {
			type,
			label: spec.label,
			description: spec.description,
			priority: spec.priority,
			default_visible: spec.defaultVisible,
			in_app_enabled: pref ? pref.in_app_enabled : defaultOn,
			push_enabled: pref ? pref.push_enabled : defaultOn
		};
	});

	return json({ data });
};

const patchSchema = z.object({
	preferences: z
		.array(
			z.object({
				type: z.enum(NOTIFICATION_TYPES),
				in_app_enabled: z.boolean().optional(),
				push_enabled: z.boolean().optional()
			})
		)
		.min(1)
});

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Invalid request' }, { status: 400 });
	}

	const now = new Date();
	for (const pref of parsed.data.preferences) {
		await db
			.insert(memberNotificationPreferences)
			.values({
				org_id: auth.orgId,
				member_id: auth.member.id,
				notification_type: pref.type,
				in_app_enabled: pref.in_app_enabled ?? true,
				push_enabled: pref.push_enabled ?? true,
				created_at: now,
				updated_at: now
			})
			.onConflictDoUpdate({
				target: [
					memberNotificationPreferences.member_id,
					memberNotificationPreferences.notification_type
				],
				set: {
					...(pref.in_app_enabled !== undefined ? { in_app_enabled: pref.in_app_enabled } : {}),
					...(pref.push_enabled !== undefined ? { push_enabled: pref.push_enabled } : {}),
					updated_at: now
				}
			});
	}

	return new Response(null, { status: 204 });
};
