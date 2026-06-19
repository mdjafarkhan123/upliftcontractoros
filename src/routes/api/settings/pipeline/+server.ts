import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

// Pipeline behavior settings (PLAN.md v3.1 §8/§9, Stage 1.3.A). Org-level, pipeline-scoped.
// Read is open to any active member; writes gate on can_manage_pipeline (same as stage config).
const pipelineSettingsSchema = z
	.object({
		won_trigger: z.enum(['quote_acceptance', 'deposit_paid']).optional(),
		ghost_lead_days: z
			.number()
			.int()
			.refine((v) => [7, 14, 21, 30].includes(v), 'Must be 7, 14, 21, or 30 days.')
			.optional()
	})
	.strict();

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const [row] = await db
		.select({
			won_trigger: organizations.won_trigger,
			ghost_lead_days: organizations.ghost_lead_days
		})
		.from(organizations)
		.where(eq(organizations.id, auth.orgId))
		.limit(1);

	if (!row) error(404, 'Organization not found.');

	return json({ data: row });
};

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_manage_pipeline) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	const parsed = pipelineSettingsSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0]?.toString();
			if (key) field_errors[key] = issue.message;
		}
		return json({ error: 'Unknown or invalid fields.', field_errors }, { status: 400 });
	}

	const input = parsed.data;
	const updates: Partial<typeof organizations.$inferInsert> = {};
	if (input.won_trigger !== undefined) updates.won_trigger = input.won_trigger;
	if (input.ghost_lead_days !== undefined) updates.ghost_lead_days = input.ghost_lead_days;

	if (Object.keys(updates).length === 0) {
		return json({ error: 'No editable fields provided.' }, { status: 400 });
	}
	updates.updated_at = new Date();

	const [row] = await db
		.update(organizations)
		.set(updates)
		.where(eq(organizations.id, auth.orgId))
		.returning({
			won_trigger: organizations.won_trigger,
			ghost_lead_days: organizations.ghost_lead_days
		});

	if (!row) error(404, 'Organization not found.');

	return json({ data: row });
};
