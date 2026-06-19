import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { stopEnrollmentById } from '$lib/server/automation/engine';

/**
 * Universal "Stop Automation" button (PLAN.md Part 6). Manually stops an active
 * or paused sequence enrollment for a contact/deal. Gated on can_send_messages —
 * the same capability that lets a staff member take over the conversation.
 */
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_send_messages) error(403, 'Forbidden');

	const id = event.params.id!;
	const stopped = await stopEnrollmentById(auth.orgId, id, 'manual');
	if (!stopped) {
		return json({ error: 'Enrollment not found or already stopped' }, { status: 404 });
	}
	return new Response(null, { status: 204 });
};
