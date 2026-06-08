import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { searchAvailableNumbers } from '$lib/server/twilio/provisioning';
import { isSmsSupportedCountry } from '$lib/utils/countries';

// Onboarding Step 3 — search available business numbers (Onboarding.md Part 3 / plan 5.2).
// Read-only against Twilio's number inventory; the subaccount/purchase happen in
// the sibling /purchase route. Country comes from the org (Step 2), the postal
// code from the request.
//
// Also serves the Settings → Integrations mini-onboarding (plan 7.2): an already
// active org reuses this same flow. So we accept both `pending_setup` (wizard) and
// `active` (settings), gate on admin role, and only enforce wizard step-order
// (password first) while still in `pending_setup`.

const searchSchema = z.object({
	postalCode: z.string().trim().min(2, 'Enter a ZIP / postal code.').max(12)
});

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	if (!auth) return json({ error: 'Unauthorized.' }, { status: 401 });

	// Phone setup lives in the wizard (pending_setup) and in Settings → Integrations
	// (active). Any other status (suspended, pending_deletion, …) has no business here.
	if (auth.orgStatus !== 'pending_setup' && auth.orgStatus !== 'active') {
		return new Response(null, { status: 204 });
	}
	// Admin-only — matches the Settings → Integrations page guard and the sibling
	// settings config routes (org, stripe). The wizard's sole user is the admin.
	if (auth.member.role !== 'admin') {
		return json({ error: 'Admin only.' }, { status: 403 });
	}
	// Wizard step order only: password (Step 1) and business profile (Step 2) first.
	if (auth.orgStatus === 'pending_setup' && !auth.supabaseUser.app_metadata.password_changed) {
		return json({ error: 'Complete the previous steps first.' }, { status: 400 });
	}
	const org = auth.org;
	if (!org.sms_enabled) {
		return json({ error: 'SMS is not enabled for this organization.' }, { status: 400 });
	}
	if (!org.country) {
		return json({ error: 'Set your business country first.' }, { status: 400 });
	}
	// UX/safety pre-filter — the picker only contains supported markets, so this
	// trips only for a legacy/unknown country. Twilio is still the real gate.
	if (!isSmsSupportedCountry(org.country)) {
		return json({ error: 'SMS is not available in your region.' }, { status: 400 });
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}

	const parsed = searchSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0];
			if (typeof key === 'string' && !field_errors[key]) field_errors[key] = issue.message;
		}
		return json({ error: 'Please fix the errors below.', field_errors }, { status: 400 });
	}

	try {
		const numbers = await searchAvailableNumbers(org.country, parsed.data.postalCode);
		return json({ data: { numbers } });
	} catch (err) {
		// Twilio rejects unsupported countries / malformed input here. Don't leak the
		// raw error (it carries Twilio codes); log it and return a friendly message.
		console.error('[onboarding/phone/search] Twilio search failed', {
			org_id: org.id,
			country: org.country,
			error: err instanceof Error ? err.message : String(err)
		});
		return json(
			{ error: 'Could not search numbers for this region. Please try again.' },
			{ status: 502 }
		);
	}
};
