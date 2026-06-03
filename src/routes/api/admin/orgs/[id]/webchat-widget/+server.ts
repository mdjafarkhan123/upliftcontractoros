/**
 * GET/PATCH /api/admin/orgs/[id]/webchat-widget
 * Jafar admin only (protected by hooks.server.ts via getJafarSession).
 */
import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { organizations, webchatWidgets, type NewWebchatWidget } from '$lib/server/db/schema';

const paramsSchema = z.object({ id: z.string().uuid() });

const patchSchema = z.object({
	display_name: z.string().max(200).nullable().optional(),
	intro_message: z.string().max(500).nullable().optional(),
	offline_message: z.string().max(500).nullable().optional(),
	webchat_mode: z.enum(['instant', 'asynchronous']).optional(),
	domain_allowlist: z.array(z.string()).optional(),
	is_active: z.boolean().optional()
});

export async function GET({ params }) {
	const parsed = paramsSchema.safeParse(params);
	if (!parsed.success) throw error(400, 'Invalid organization ID.');

	const [org] = await db
		.select({ id: organizations.id, widget_token: organizations.widget_token })
		.from(organizations)
		.where(eq(organizations.id, parsed.data.id))
		.limit(1);

	if (!org) throw error(404, 'Organization not found.');

	const [widget] = await db
		.select()
		.from(webchatWidgets)
		.where(eq(webchatWidgets.org_id, parsed.data.id))
		.limit(1);

	return json({
		data: {
			widget: widget ?? null,
			widget_token: org.widget_token
		}
	});
}

export async function PATCH({ params, request }) {
	const parsedParams = paramsSchema.safeParse(params);
	if (!parsedParams.success) throw error(400, 'Invalid organization ID.');

	const body = await request.json().catch(() => ({}));
	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		throw error(400, issue?.message ?? 'Invalid request body.');
	}

	const orgId = parsedParams.data.id;

	const [existing] = await db
		.select({ id: webchatWidgets.id })
		.from(webchatWidgets)
		.where(eq(webchatWidgets.org_id, orgId))
		.limit(1);

	if (!existing) {
		const insertValues: NewWebchatWidget = {
			org_id: orgId,
			display_name: parsed.data.display_name ?? null,
			intro_message: parsed.data.intro_message ?? null,
			offline_message: parsed.data.offline_message ?? null,
			webchat_mode: parsed.data.webchat_mode ?? 'asynchronous',
			domain_allowlist: parsed.data.domain_allowlist ?? [],
			is_active: parsed.data.is_active ?? true
		};
		await db.insert(webchatWidgets).values(insertValues);
	} else {
		await db
			.update(webchatWidgets)
			.set({
				...(parsed.data.display_name !== undefined && { display_name: parsed.data.display_name }),
				...(parsed.data.intro_message !== undefined && {
					intro_message: parsed.data.intro_message
				}),
				...(parsed.data.offline_message !== undefined && {
					offline_message: parsed.data.offline_message
				}),
				...(parsed.data.webchat_mode !== undefined && { webchat_mode: parsed.data.webchat_mode }),
				...(parsed.data.domain_allowlist !== undefined && {
					domain_allowlist: parsed.data.domain_allowlist
				}),
				...(parsed.data.is_active !== undefined && { is_active: parsed.data.is_active }),
				updated_at: new Date()
			})
			.where(eq(webchatWidgets.org_id, orgId));
	}

	const [updated] = await db
		.select()
		.from(webchatWidgets)
		.where(eq(webchatWidgets.org_id, orgId))
		.limit(1);

	return json({ data: { widget: updated } });
}
