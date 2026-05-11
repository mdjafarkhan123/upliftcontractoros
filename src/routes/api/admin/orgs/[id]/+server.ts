import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { organizations } from '$lib/server/db/schema';

const paramsSchema = z.object({ id: z.string().uuid() });
const statusSchema = z.object({ status: z.enum(['active', 'suspended']) });

export async function GET({ params }) {
	const parsed = paramsSchema.safeParse(params);
	if (!parsed.success) throw error(400, 'Invalid organization ID.');

	const [org] = await db
		.select({
			id: organizations.id,
			name: organizations.name,
			slug: organizations.slug,
			status: organizations.status,
			trade_type: organizations.trade_type,
			city: organizations.city,
			state: organizations.state,
			timezone: organizations.timezone,
			twilio_phone_number: organizations.twilio_phone_number,
			is_setup_complete: organizations.is_setup_complete,
			created_at: organizations.created_at,
			updated_at: organizations.updated_at
		})
		.from(organizations)
		.where(eq(organizations.id, parsed.data.id))
		.limit(1);

	if (!org) throw error(404, 'Organization not found.');

	return json({ org });
}

export async function PATCH({ params, request }) {
	const parsedParams = paramsSchema.safeParse(params);
	if (!parsedParams.success) throw error(400, 'Invalid organization ID.');

	const parsedBody = statusSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsedBody.success) throw error(400, 'Invalid organization status.');

	const now = new Date();
	await db
		.update(organizations)
		.set({
			status: parsedBody.data.status,
			suspended_at: parsedBody.data.status === 'suspended' ? now : null,
			updated_at: now
		})
		.where(eq(organizations.id, parsedParams.data.id));

	return json({ ok: true });
}
