import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { outboxEvents } from '$lib/server/db/schema';

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST({ params }) {
	const parsed = paramsSchema.safeParse(params);
	if (!parsed.success) throw error(400, 'Invalid outbox event ID.');

	await db
		.update(outboxEvents)
		.set({
			status: 'pending',
			attempts: 0,
			available_at: new Date(),
			processed_at: null,
			dead_lettered_at: null,
			last_error: null,
			updated_at: new Date()
		})
		.where(eq(outboxEvents.id, parsed.data.id));

	return json({ ok: true });
}
