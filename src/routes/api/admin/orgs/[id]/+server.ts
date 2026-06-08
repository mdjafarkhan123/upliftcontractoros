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
	limits: limitsSchema.optional(),
	sms_enabled: z.boolean().optional(),
	// PO manual carrier-approval flip (Step 6). Unblocks/blocks outbound SMS at the
	// worker gate; the contractor's session reloads via feature_overrides_updated_at.
	sms_approval_status: z.enum(['not_required', 'pending', 'approved', 'rejected']).optional(),
	// PO note shown to the contractor + /jafar Details tab when a submission is
	// rejected / needs resubmission. Pass null to clear it (e.g. on approval).
	sms_approval_reason: z.string().trim().max(1000).nullable().optional()
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

	const { plan, featureFlags, limits, sms_enabled, sms_approval_status, sms_approval_reason } =
		parsed.data;
	if (
		!plan &&
		!featureFlags &&
		!limits &&
		sms_enabled === undefined &&
		sms_approval_status === undefined &&
		sms_approval_reason === undefined
	) {
		throw error(400, 'No fields to update.');
	}

	// feature_flags_updated_by stays NULL — Platform Owner has no org_members row.
	await db
		.update(organizations)
		.set({
			...(plan ? { plan } : {}),
			...(featureFlags ?? {}),
			...(limits ?? {}),
			...(sms_enabled !== undefined ? { sms_enabled } : {}),
			...(sms_approval_status !== undefined ? { sms_approval_status } : {}),
			...(sms_approval_reason !== undefined ? { sms_approval_reason } : {}),
			feature_overrides_updated_at: now,
			updated_at: now
		})
		.where(eq(organizations.id, parsedParams.data.id));

	return json({ ok: true });
}
