import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { automationSettings } from '$lib/server/db/schema';

const paramsSchema = z.object({ id: z.string().uuid() });

const bodySchema = z.object({
	google_review_link: z
		.string()
		.trim()
		.url('Must be a valid URL.')
		.max(2000)
		.nullable()
		.or(z.literal('').transform(() => null))
});

export const PUT: RequestHandler = async ({ params, request }) => {
	const parsedParams = paramsSchema.safeParse(params);
	if (!parsedParams.success) throw error(400, 'Invalid organization ID.');

	const raw = await request.json().catch(() => ({}));
	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return json(
			{
				error: 'Invalid request body.',
				field_errors: Object.fromEntries(
					parsed.error.issues.map((i) => [i.path.join('.'), i.message])
				)
			},
			{ status: 400 }
		);
	}

	const updated = await db
		.update(automationSettings)
		.set({ google_review_link: parsed.data.google_review_link, updated_at: new Date() })
		.where(eq(automationSettings.org_id, parsedParams.data.id))
		.returning({ google_review_link: automationSettings.google_review_link });

	if (updated.length === 0) throw error(404, 'Automation settings not found for org.');

	return json({ data: { google_review_link: updated[0].google_review_link } });
};
