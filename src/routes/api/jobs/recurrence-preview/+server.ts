import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { recurrenceSchema, validateRecurrence } from '$lib/server/jobs/schemas';
import { expandRecurrence } from '$lib/server/jobs/recurrence';

// Read-only preview of a recurring rule. The "New Job" page calls this (debounced)
// to show the live "Total visits N · First · Last" summary, reusing the SAME
// expandRecurrence engine the POST route uses so the count shown is exactly the
// number of visits that will be created. No DB writes — pure date math.
const previewSchema = z
	.object({
		scheduled_start: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid start'),
		scheduled_end: z
			.string()
			.refine((v) => !isNaN(Date.parse(v)), 'Invalid end')
			.nullable()
			.optional(),
		recurrence: recurrenceSchema
	})
	.superRefine((d, ctx) => validateRecurrence(d.recurrence, ctx));

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = previewSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
	}

	const { scheduled_start, scheduled_end, recurrence } = parsed.data;
	const visits = expandRecurrence(
		new Date(scheduled_start),
		scheduled_end ? new Date(scheduled_end) : null,
		recurrence
	);

	return json({
		data: {
			count: visits.length,
			first: visits[0]?.start.toISOString() ?? null,
			last: visits[visits.length - 1]?.start.toISOString() ?? null
		}
	});
};
