import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { automationSettings } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

// Lightweight read of the "job scheduled" client-confirmation template so the New Job
// form can show a live preview (and seed the per-job edit box) without hitting the
// admin-only /api/settings/automation endpoint. Gated to whoever can create a job
// (can_view_full_pipeline) — the same people who see the notify picker.
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_view_full_pipeline) error(403, 'Forbidden');

	const [row] = await db
		.select({
			enabled: automationSettings.job_scheduled_confirmation_enabled,
			sms_message: automationSettings.job_scheduled_sms_message,
			email_subject: automationSettings.job_scheduled_email_subject,
			email_message: automationSettings.job_scheduled_email_message
		})
		.from(automationSettings)
		.where(eq(automationSettings.org_id, auth.orgId))
		.limit(1);

	if (!row) error(404, 'Automation settings not found.');

	return json({ data: row });
};
