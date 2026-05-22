import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { availabilityWindows } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { requireFeature } from '$lib/server/auth/featureGuard';
import { loadBookingLinkForOrg } from '$lib/server/booking/loadBookingLink';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const windowSchema = z.object({
	day_of_week: z.number().int().min(0).max(6),
	start_time: z.string().regex(timeRegex, 'Invalid time (HH:MM).'),
	end_time: z.string().regex(timeRegex, 'Invalid time (HH:MM).')
});

const bodySchema = z.object({
	windows: z.array(windowSchema).max(50)
});

function toMinutes(t: string): number {
	const [h, m] = t.split(':');
	return Number(h) * 60 + Number(m);
}

export const PUT: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');
	requireFeature(auth, 'feature_online_booking');

	const link = await loadBookingLinkForOrg(auth.orgId, event.params.id!);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
			{ status: 400 }
		);
	}

	const windows = parsed.data.windows;

	for (const w of windows) {
		if (toMinutes(w.end_time) <= toMinutes(w.start_time)) {
			return json(
				{ error: 'End time must be after start time on each window.' },
				{ status: 400 }
			);
		}
	}

	const byDay = new Map<number, { start: number; end: number }[]>();
	for (const w of windows) {
		const arr = byDay.get(w.day_of_week) ?? [];
		arr.push({ start: toMinutes(w.start_time), end: toMinutes(w.end_time) });
		byDay.set(w.day_of_week, arr);
	}
	for (const list of byDay.values()) {
		list.sort((a, b) => a.start - b.start);
		for (let i = 1; i < list.length; i++) {
			if (list[i].start < list[i - 1].end) {
				return json(
					{ error: 'Windows on the same day cannot overlap.' },
					{ status: 400 }
				);
			}
		}
	}

	const normalize = (t: string) => (t.length === 5 ? `${t}:00` : t);

	await db.transaction(async (tx) => {
		await tx
			.delete(availabilityWindows)
			.where(eq(availabilityWindows.booking_link_id, link.id));
		if (windows.length > 0) {
			await tx.insert(availabilityWindows).values(
				windows.map((w) => ({
					booking_link_id: link.id,
					day_of_week: w.day_of_week,
					start_time: normalize(w.start_time),
					end_time: normalize(w.end_time)
				}))
			);
		}
	});

	const rows = await db
		.select()
		.from(availabilityWindows)
		.where(eq(availabilityWindows.booking_link_id, link.id));

	return json({ data: rows });
};
