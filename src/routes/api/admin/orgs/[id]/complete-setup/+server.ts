import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { completeOrgSetup } from '$lib/server/admin/orgProvisioning';

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST({ params }) {
	const parsed = paramsSchema.safeParse(params);
	if (!parsed.success) throw error(400, 'Invalid organization ID.');

	await completeOrgSetup(parsed.data.id);

	return json({ ok: true });
}
