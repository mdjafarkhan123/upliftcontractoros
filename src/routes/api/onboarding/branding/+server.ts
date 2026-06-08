import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations } from '$lib/server/db/schema';
import { isValidHexColor, normalizeHexColor } from '$lib/utils/validation/hexColor';

// Onboarding Step 5 — Branding (Onboarding.md Part 3). Brand color + calendar
// visible hours. Skippable: every field is optional and the wizard can skip
// straight to completion. Logo is intentionally NOT collected here — the media
// upload path requires an active org; contractors add a logo later in Settings.

const brandingSchema = z.object({
	// Empty string clears the color; otherwise it must be a hex like #3b82f6.
	primary_color: z
		.string()
		.trim()
		.max(20)
		.optional()
		.transform((v) => (v && v.length > 0 ? v : null)),
	calendar_day_start_hour: z.number().int().min(0).max(23).optional(),
	calendar_day_end_hour: z.number().int().min(1).max(24).optional()
});

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	if (!auth) return json({ error: 'Unauthorized.' }, { status: 401 });

	// Only orgs still in the wizard write branding here. Once active, branding is
	// edited via Settings → Org. Idempotent no-op otherwise.
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

	const parsed = brandingSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0];
			if (typeof key === 'string' && !field_errors[key]) field_errors[key] = issue.message;
		}
		return json({ error: 'Please fix the errors below.', field_errors }, { status: 400 });
	}

	const { primary_color, calendar_day_start_hour, calendar_day_end_hour } = parsed.data;
	const field_errors: Record<string, string> = {};
	const updates: Partial<typeof organizations.$inferInsert> = { updated_at: new Date() };

	if (primary_color === null) {
		updates.primary_color = null;
	} else if (!isValidHexColor(primary_color)) {
		field_errors.primary_color = 'Must be a hex color like #3b82f6.';
	} else {
		updates.primary_color = normalizeHexColor(primary_color);
	}

	// Hours validate as a pair against existing values, mirroring Settings → Org.
	if (calendar_day_start_hour !== undefined || calendar_day_end_hour !== undefined) {
		const [existing] = await db
			.select({
				s: organizations.calendar_day_start_hour,
				e: organizations.calendar_day_end_hour
			})
			.from(organizations)
			.where(eq(organizations.id, auth.orgId))
			.limit(1);
		const s = calendar_day_start_hour ?? existing?.s ?? 7;
		const e = calendar_day_end_hour ?? existing?.e ?? 19;
		if (e <= s) {
			field_errors.calendar_day_end_hour = 'End hour must be after start hour.';
		} else {
			if (calendar_day_start_hour !== undefined) updates.calendar_day_start_hour = calendar_day_start_hour;
			if (calendar_day_end_hour !== undefined) updates.calendar_day_end_hour = calendar_day_end_hour;
		}
	}

	if (Object.keys(field_errors).length > 0) {
		return json({ error: 'Please fix the errors below.', field_errors }, { status: 400 });
	}

	await db.update(organizations).set(updates).where(eq(organizations.id, auth.orgId));

	return new Response(null, { status: 204 });
};
