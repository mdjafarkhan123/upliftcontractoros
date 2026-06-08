import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { completeOnboarding } from '$lib/server/admin/orgProvisioning';

// Terminal onboarding action: flip the org out of `pending_setup` into `active`.
// Guarded so a half-onboarded org can't skip the forced password step.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	if (!auth) return json({ error: 'Unauthorized.' }, { status: 401 });

	// Already completed (or never gated) — idempotent no-op.
	if (auth.orgStatus !== 'pending_setup') {
		return new Response(null, { status: 204 });
	}

	if (!auth.supabaseUser.app_metadata.password_changed) {
		return json({ error: 'Complete the previous steps first.' }, { status: 400 });
	}

	await completeOnboarding(auth.orgId);
	return new Response(null, { status: 204 });
};
