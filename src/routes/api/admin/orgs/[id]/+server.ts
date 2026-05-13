import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { organizations } from '$lib/server/db/schema';
import { featureFlagsSchema, limitsSchema, planNameSchema } from '$lib/admin/planTemplates';

const paramsSchema = z.object({ id: z.string().uuid() });

const statusPatchSchema = z.object({
	status: z.enum(['active', 'suspended'])
});

const entitlementsPatchSchema = z.object({
	plan: planNameSchema.optional(),
	featureFlags: featureFlagsSchema.optional(),
	limits: limitsSchema.optional()
});

const patchSchema = z.union([statusPatchSchema, entitlementsPatchSchema]);

export async function GET({ params }) {
	const parsed = paramsSchema.safeParse(params);
	if (!parsed.success) throw error(400, 'Invalid organization ID.');

	const [org] = await db
		.select()
		.from(organizations)
		.where(eq(organizations.id, parsed.data.id))
		.limit(1);

	if (!org) throw error(404, 'Organization not found.');

	return json({ org });
}

export async function PATCH({ params, request }) {
	const parsedParams = paramsSchema.safeParse(params);
	if (!parsedParams.success) throw error(400, 'Invalid organization ID.');

	const body = await request.json().catch(() => ({}));
	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.issues[0]?.message ?? 'Invalid request body.');

	const now = new Date();

	if ('status' in parsed.data) {
		await db
			.update(organizations)
			.set({
				status: parsed.data.status,
				suspended_at: parsed.data.status === 'suspended' ? now : null,
				updated_at: now
			})
			.where(eq(organizations.id, parsedParams.data.id));

		return json({ ok: true });
	}

	const { plan, featureFlags, limits } = parsed.data;
	if (!plan && !featureFlags && !limits) {
		throw error(400, 'No fields to update.');
	}

	// feature_flags_updated_by stays NULL — Platform Owner has no org_members row.
	await db
		.update(organizations)
		.set({
			...(plan ? { plan } : {}),
			...(featureFlags ?? {}),
			...(limits ?? {}),
			feature_overrides_updated_at: now,
			updated_at: now
		})
		.where(eq(organizations.id, parsedParams.data.id));

	return json({ ok: true });
}
