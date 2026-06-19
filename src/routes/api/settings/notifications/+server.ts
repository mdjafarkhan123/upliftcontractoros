import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { memberNotificationPreferences, orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { NOTIFICATION_SPEC } from '$lib/notifications/spec';
import { NOTIFICATION_TYPES } from '$lib/notifications/types';
import type { NotificationType } from '$lib/notifications/types';
import { preferencesForMember } from '$lib/server/notifications/preferences';
import { toE164, PhoneInvalidError } from '$lib/utils/phone';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const types = [...NOTIFICATION_TYPES] as NotificationType[];
	const prefsMap = await preferencesForMember(auth.member.id, types);

	const preferences = types.map((type) => {
		const spec = NOTIFICATION_SPEC[type];
		const pref = prefsMap.get(type);
		const defaultOn = spec.priority !== 'silent';
		// SMS is only ever offered for critical/high types (architecture rule:
		// SMS = real money). Surface this to the UI so it can hide the toggle.
		const smsEligible = spec.priority === 'critical' || spec.priority === 'high';
		return {
			type,
			label: spec.label,
			description: spec.description,
			priority: spec.priority,
			default_visible: spec.defaultVisible,
			sms_eligible: smsEligible,
			in_app_enabled: pref ? pref.in_app_enabled : defaultOn,
			push_enabled: pref ? pref.push_enabled : defaultOn,
			email_enabled: pref ? pref.email_enabled : false,
			sms_enabled: pref ? pref.sms_enabled : false
		};
	});

	const m = auth.member;
	const settings = {
		notification_phone: m.notification_phone ?? null,
		// Admin ceilings — read-only context for the member (set in Team settings).
		sms_notifications_allowed: m.sms_notifications_allowed,
		email_notifications_allowed: m.email_notifications_allowed,
		personal_quiet_hours_enabled: m.personal_quiet_hours_enabled,
		personal_quiet_hours_start_hour: m.personal_quiet_hours_start_hour ?? null,
		personal_quiet_hours_end_hour: m.personal_quiet_hours_end_hour ?? null,
		escalation_minutes: m.escalation_minutes,
		// "My Status" — set here or from the avatar menu (PATCH /api/me/status).
		notification_status: m.notification_status,
		notification_status_expires_at: m.notification_status_expires_at
			? m.notification_status_expires_at.toISOString()
			: null
	};

	return json({ data: { preferences, settings } });
};

const hour = z.number().int().min(0).max(23);

const patchSchema = z.object({
	preferences: z
		.array(
			z.object({
				type: z.enum(NOTIFICATION_TYPES),
				in_app_enabled: z.boolean().optional(),
				push_enabled: z.boolean().optional(),
				email_enabled: z.boolean().optional(),
				sms_enabled: z.boolean().optional()
			})
		)
		.optional(),
	settings: z
		.object({
			// Member edits their OWN alert number. null/'' clears it.
			notification_phone: z.string().nullable().optional(),
			personal_quiet_hours_enabled: z.boolean().optional(),
			personal_quiet_hours_start_hour: hour.nullable().optional(),
			personal_quiet_hours_end_hour: hour.nullable().optional(),
			escalation_minutes: z.number().int().min(1).max(60).optional()
		})
		.optional()
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

	// --- Per-type channel preferences ---
	if (parsed.data.preferences && parsed.data.preferences.length > 0) {
		for (const pref of parsed.data.preferences) {
			await db
				.insert(memberNotificationPreferences)
				.values({
					org_id: auth.orgId,
					member_id: auth.member.id,
					notification_type: pref.type,
					in_app_enabled: pref.in_app_enabled ?? true,
					push_enabled: pref.push_enabled ?? true,
					email_enabled: pref.email_enabled ?? false,
					sms_enabled: pref.sms_enabled ?? false,
					created_at: now,
					updated_at: now
				})
				.onConflictDoUpdate({
					target: [
						memberNotificationPreferences.member_id,
						memberNotificationPreferences.notification_type
					],
					set: {
						...(pref.in_app_enabled !== undefined
							? { in_app_enabled: pref.in_app_enabled }
							: {}),
						...(pref.push_enabled !== undefined ? { push_enabled: pref.push_enabled } : {}),
						...(pref.email_enabled !== undefined ? { email_enabled: pref.email_enabled } : {}),
						...(pref.sms_enabled !== undefined ? { sms_enabled: pref.sms_enabled } : {}),
						updated_at: now
					}
				});
		}
	}

	// --- Member-level settings (own phone, quiet hours, escalation) ---
	const s = parsed.data.settings;
	if (s) {
		const fieldErrors: Record<string, string> = {};
		const updates: Record<string, unknown> = {};

		if ('notification_phone' in s) {
			const raw = s.notification_phone;
			if (raw == null || raw.trim() === '') {
				updates.notification_phone = null;
			} else {
				try {
					updates.notification_phone = toE164(raw);
				} catch (e) {
					fieldErrors.notification_phone =
						e instanceof PhoneInvalidError ? e.message : 'Invalid phone number.';
				}
			}
		}
		if (s.personal_quiet_hours_enabled !== undefined) {
			updates.personal_quiet_hours_enabled = s.personal_quiet_hours_enabled;
		}
		if ('personal_quiet_hours_start_hour' in s) {
			updates.personal_quiet_hours_start_hour = s.personal_quiet_hours_start_hour ?? null;
		}
		if ('personal_quiet_hours_end_hour' in s) {
			updates.personal_quiet_hours_end_hour = s.personal_quiet_hours_end_hour ?? null;
		}
		if (s.escalation_minutes !== undefined) {
			updates.escalation_minutes = s.escalation_minutes;
		}

		if (Object.keys(fieldErrors).length > 0) {
			return json({ error: 'Please fix the highlighted fields.', field_errors: fieldErrors }, { status: 400 });
		}

		if (Object.keys(updates).length > 0) {
			updates.updated_at = now;
			await db.update(orgMembers).set(updates).where(eq(orgMembers.id, auth.member.id));
		}
	}

	return new Response(null, { status: 204 });
};
