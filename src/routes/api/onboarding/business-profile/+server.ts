import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations } from '$lib/server/db/schema';
import { isValidCountry } from '$lib/utils/countries';

// Onboarding Step 2 — Business Profile (Onboarding.md Part 3). Company name,
// trade type, address, country, and timezone. Country is stored now because it
// drives phone availability + carrier approval in later steps.

const optionalTrimmed = z
	.string()
	.trim()
	.max(200)
	.optional()
	.transform((v) => (v && v.length > 0 ? v : null));

function isValidTimezone(tz: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

const businessProfileSchema = z.object({
	name: z.string().trim().min(1, 'Company name is required.').max(200),
	trade_type: z.string().trim().min(1, 'Trade type is required.').max(120),
	country: z
		.string()
		.trim()
		.min(1, 'Country is required.')
		.refine(isValidCountry, 'Select a valid country.'),
	timezone: z
		.string()
		.trim()
		.min(1, 'Timezone is required.')
		.refine(isValidTimezone, 'Select a valid timezone.'),
	address: optionalTrimmed,
	city: optionalTrimmed,
	state: optionalTrimmed,
	zip: optionalTrimmed
});

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	if (!auth) return json({ error: 'Unauthorized.' }, { status: 401 });

	// Only orgs still in the wizard can write the onboarding profile. Once active,
	// the profile is edited via Settings → Org. Idempotent no-op otherwise.
	if (auth.orgStatus !== 'pending_setup') {
		return new Response(null, { status: 204 });
	}

	// Enforce step order: password (Step 1) must be done first.
	if (!auth.supabaseUser.app_metadata.password_changed) {
		return json({ error: 'Complete the previous steps first.' }, { status: 400 });
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}

	const parsed = businessProfileSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0];
			if (typeof key === 'string' && !field_errors[key]) field_errors[key] = issue.message;
		}
		return json({ error: 'Please fix the errors below.', field_errors }, { status: 400 });
	}

	const { name, trade_type, country, timezone, address, city, state, zip } = parsed.data;

	await db
		.update(organizations)
		.set({
			name,
			trade_type,
			country: country.toUpperCase(),
			timezone,
			address,
			city,
			state,
			zip,
			updated_at: new Date()
		})
		.where(eq(organizations.id, auth.orgId));

	return new Response(null, { status: 204 });
};
