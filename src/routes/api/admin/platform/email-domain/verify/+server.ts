/**
 * POST /api/admin/platform/email-domain/verify
 *
 * Jafar admin only (hooks.server.ts guards /api/admin/*). Drives the PO's "Verify"
 * button: triggers a Brevo auth check on the platform system domain, reads the
 * current status, and persists it. Manual check — no background job.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyPlatformEmailDomain } from '$lib/server/email/platformEmailDomain';

export const POST: RequestHandler = async () => {
	const result = await verifyPlatformEmailDomain();
	if (!result.ok) return json({ error: result.error }, { status: result.status });
	return json({ data: result.state });
};
