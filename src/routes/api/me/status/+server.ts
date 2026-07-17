import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { invalidateAuthContextCache } from '$lib/server/auth/loadAuthContext';

const schema = z.object({
	status: z.enum(['in_office', 'on_job', 'deep_work', 'off_duty']),
	// How long a temporary status sticks before auto-reverting. Ignored for the
	// default (in_office) which never expires.
	clear_after: z.enum(['none', '1h', '4h', 'tomorrow']).default('none')
});

// Compute the auto-revert instant from a "clear after" token, in the org timezone so
// "Tomorrow" means 8 AM local. Falls back to a plain +16h offset if the tz is bad.
function computeExpiry(
	clearAfter: 'none' | '1h' | '4h' | 'tomorrow',
	timezone: string,
	now: Date
): Date | null {
	switch (clearAfter) {
		case '1h':
			return new Date(now.getTime() + 60 * 60 * 1000);
		case '4h':
			return new Date(now.getTime() + 4 * 60 * 60 * 1000);
		case 'tomorrow':
			try {
				const tomorrow = formatInTimeZone(
					new Date(now.getTime() + 24 * 60 * 60 * 1000),
					timezone,
					'yyyy-MM-dd'
				);
				return fromZonedTime(`${tomorrow} 08:00:00`, timezone);
			} catch {
				return new Date(now.getTime() + 16 * 60 * 60 * 1000);
			}
		default:
			return null;
	}
}

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Invalid request' }, { status: 400 });
	}

	const now = new Date();
	const status = parsed.data.status;
	// Setting back to the default clears any pending expiry; the default never reverts.
	const expiresAt =
		status === 'in_office' ? null : computeExpiry(parsed.data.clear_after, auth.org.timezone, now);

	await db
		.update(orgMembers)
		.set({
			notification_status: status,
			notification_status_expires_at: expiresAt,
			updated_at: now
		})
		.where(eq(orgMembers.id, auth.member.id));

	// The routing worker + middleware read the member via the 15s auth cache — drop it
	// so the new status takes effect immediately instead of lagging.
	invalidateAuthContextCache(auth.supabaseUser.id);

	return json({
		data: {
			notification_status: status,
			notification_status_expires_at: expiresAt ? expiresAt.toISOString() : null
		}
	});
};
