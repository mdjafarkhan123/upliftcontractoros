import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { ALL_PERMISSION_KEYS, isKnownPermissionKey } from '$lib/team/permissions-config';
import { toE164, PhoneInvalidError } from '$lib/utils/phone';

const nameSchema = z.string().min(1, 'Name is required').max(200).trim();

// Notification identity + admin gates (Stage 1.a) — handled alongside, but
// separately from, the can_* permission keys.
const NOTIFICATION_FIELD_KEYS = [
	'notification_phone',
	'sms_notifications_allowed',
	'email_notifications_allowed'
] as const;

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_view_team_members) error(403, 'Forbidden');

	const memberId = event.params.id;

	const [member] = await db
		.select()
		.from(orgMembers)
		.where(
			and(
				eq(orgMembers.id, memberId),
				eq(orgMembers.org_id, auth.orgId),
				isNull(orgMembers.deleted_at)
			)
		)
		.limit(1);

	if (!member) error(404, 'Not found');

	// Hourly cost rate is private financial data (job-costing labor input) — strip it for
	// viewers who can't see revenue, same gate as job/quote cost.
	const data = auth.member.can_view_revenue ? member : { ...member, hourly_cost_rate: null };

	return json({ data });
};

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_edit_team_members) error(403, 'Forbidden');

	const memberId = event.params.id;

	if (memberId === auth.member.id) {
		return json({ error: 'You cannot edit your own permissions.' }, { status: 403 });
	}

	const [target] = await db
		.select({ id: orgMembers.id, role: orgMembers.role })
		.from(orgMembers)
		.where(
			and(
				eq(orgMembers.id, memberId),
				eq(orgMembers.org_id, auth.orgId),
				isNull(orgMembers.deleted_at)
			)
		)
		.limit(1);

	if (!target) error(404, 'Not found');

	if (target.role === 'admin') {
		return json({ error: "You cannot edit an Admin's permissions." }, { status: 403 });
	}

	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	const updates: Partial<typeof orgMembers.$inferInsert> & { updated_at: Date } = {
		updated_at: new Date()
	};
	const fieldErrors: Record<string, string> = {};

	// Reject any unrecognised keys up front
	for (const key of Object.keys(body)) {
		if (key === 'full_name') continue;
		if (key === 'hourly_cost_rate') continue;
		if ((NOTIFICATION_FIELD_KEYS as readonly string[]).includes(key)) continue;
		if (!isKnownPermissionKey(key)) {
			fieldErrors[key] = 'Unknown field';
		}
	}

	// Job-costing labor input — private financial data. Requires can_view_revenue on TOP of the
	// can_edit_team_members gate already enforced above (same double-gate as job expenses).
	if ('hourly_cost_rate' in body) {
		if (!auth.member.can_view_revenue) {
			fieldErrors.hourly_cost_rate = 'Forbidden';
		} else {
			const raw = body.hourly_cost_rate;
			if (raw === null || raw === '') {
				updates.hourly_cost_rate = null;
			} else {
				const n = Number(raw);
				if (!Number.isFinite(n) || n < 0 || n > 9999999.99) {
					fieldErrors.hourly_cost_rate = 'Enter a valid hourly rate.';
				} else {
					updates.hourly_cost_rate = String(n);
				}
			}
		}
	}

	// Validate full_name if present
	if ('full_name' in body) {
		const result = nameSchema.safeParse(body.full_name);
		if (!result.success) {
			fieldErrors.full_name = result.error.issues[0]?.message ?? 'Invalid name';
		} else {
			updates.full_name = result.data;
		}
	}

	// Notification identity + admin gates. Empty/null phone clears it.
	if ('notification_phone' in body) {
		const raw = body.notification_phone;
		if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
			updates.notification_phone = null;
		} else if (typeof raw !== 'string') {
			fieldErrors.notification_phone = 'Invalid phone number.';
		} else {
			try {
				updates.notification_phone = toE164(raw);
			} catch (e) {
				fieldErrors.notification_phone =
					e instanceof PhoneInvalidError ? e.message : 'Invalid phone number.';
			}
		}
	}

	for (const key of ['sms_notifications_allowed', 'email_notifications_allowed'] as const) {
		if (key in body) {
			if (typeof body[key] !== 'boolean') fieldErrors[key] = 'Must be true or false';
			else updates[key] = body[key] as boolean;
		}
	}

	// Validate permission booleans
	for (const key of ALL_PERMISSION_KEYS) {
		if (key in body) {
			if (typeof body[key] !== 'boolean') {
				fieldErrors[key] = 'Must be true or false';
			} else {
				(updates as Record<string, unknown>)[key] = body[key];
			}
		}
	}

	if (Object.keys(fieldErrors).length > 0) {
		return json({ error: 'Validation failed.', field_errors: fieldErrors }, { status: 400 });
	}

	// Only updated_at means nothing to change
	if (Object.keys(updates).length <= 1) {
		return json({ error: 'No fields to update.' }, { status: 400 });
	}

	const [updated] = await db
		.update(orgMembers)
		.set(updates)
		.where(
			and(
				eq(orgMembers.id, memberId),
				eq(orgMembers.org_id, auth.orgId),
				isNull(orgMembers.deleted_at)
			)
		)
		.returning();

	if (!updated) error(404, 'Not found');

	const data = auth.member.can_view_revenue ? updated : { ...updated, hourly_cost_rate: null };
	return json({ data });
};
