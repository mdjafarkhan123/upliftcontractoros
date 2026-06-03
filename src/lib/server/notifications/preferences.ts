import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { memberNotificationPreferences } from '$lib/server/db/schema';
import { NOTIFICATION_SPEC } from '$lib/notifications/spec';
import type { NotificationType } from '$lib/notifications/types';

type Pref = { in_app_enabled: boolean; push_enabled: boolean };

// Silent-priority types are off by default; all others default to on.
function defaultPref(type: NotificationType): Pref {
	const silent = NOTIFICATION_SPEC[type]?.priority === 'silent';
	return { in_app_enabled: !silent, push_enabled: !silent };
}

export async function preferenceFor(memberId: string, type: NotificationType): Promise<Pref> {
	const [row] = await db
		.select({
			in_app_enabled: memberNotificationPreferences.in_app_enabled,
			push_enabled: memberNotificationPreferences.push_enabled
		})
		.from(memberNotificationPreferences)
		.where(
			and(
				eq(memberNotificationPreferences.member_id, memberId),
				eq(memberNotificationPreferences.notification_type, type)
			)
		)
		.limit(1);

	return row ?? defaultPref(type);
}

// Bulk load for a member — used by settings API
export async function preferencesForMember(
	memberId: string,
	types: NotificationType[]
): Promise<Map<NotificationType, Pref>> {
	const rows = await db
		.select({
			notification_type: memberNotificationPreferences.notification_type,
			in_app_enabled: memberNotificationPreferences.in_app_enabled,
			push_enabled: memberNotificationPreferences.push_enabled
		})
		.from(memberNotificationPreferences)
		.where(
			and(
				eq(memberNotificationPreferences.member_id, memberId),
				inArray(memberNotificationPreferences.notification_type, types)
			)
		);

	const map = new Map<NotificationType, Pref>();
	for (const row of rows) {
		map.set(row.notification_type as NotificationType, {
			in_app_enabled: row.in_app_enabled,
			push_enabled: row.push_enabled
		});
	}
	return map;
}
