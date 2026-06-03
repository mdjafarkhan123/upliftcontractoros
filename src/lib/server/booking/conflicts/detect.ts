// Conflict detection against existing appointments.
// Engine is stateless and uncached; fetch is performed on each request.

import { addMinutes } from 'date-fns';
import { and, eq, gte, lt, notInArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { appointments } from '$lib/server/db/schema';
import type { IsoDate } from '../types';
import { startOfLocalDayUtc, startOfNextLocalDayUtc } from '../timezone/utils';

// Rule 5:
//   effective_end = scheduled_end ?? scheduled_start + slot_duration_minutes
//   blocked_start = scheduled_start
//   blocked_end   = effective_end + buffer_minutes
//   candidate conflicts when: candidate_start < blocked_end AND candidate_end > blocked_start
//
// Query range (inclusive lower, exclusive upper):
//   dayStartUtc <= scheduled_start < nextDayStartUtc
export async function detectConflicts(
	orgId: string,
	date: IsoDate,
	timezone: string,
	candidates: Date[],
	slotDurationMinutes: number,
	bufferMinutes: number
): Promise<Date[]> {
	if (candidates.length === 0) return [];

	const dayStartUtc = startOfLocalDayUtc(date, timezone);
	const nextDayStartUtc = startOfNextLocalDayUtc(date, timezone);

	// Pull a slightly wider window so appointments that start the previous day but
	// extend into this day are still considered. A buffer of 1 day is sufficient
	// for any reasonable appointment length.
	const fetchStart = addMinutes(dayStartUtc, -24 * 60);

	const existing = await db
		.select({
			scheduled_start: appointments.scheduled_start,
			scheduled_end: appointments.scheduled_end
		})
		.from(appointments)
		.where(
			and(
				eq(appointments.org_id, orgId),
				gte(appointments.scheduled_start, fetchStart),
				lt(appointments.scheduled_start, nextDayStartUtc),
				notInArray(appointments.status, ['cancelled', 'no_show']),
				sql`${appointments.deleted_at} IS NULL`
			)
		);

	if (existing.length === 0) return candidates;

	const slotMs = slotDurationMinutes * 60_000;
	const bufferMs = Math.max(0, bufferMinutes) * 60_000;

	type Block = { startMs: number; endMs: number };
	const blocks: Block[] = existing.map((a) => {
		const startMs = a.scheduled_start.getTime();
		const endMs = (a.scheduled_end ? a.scheduled_end.getTime() : startMs + slotMs) + bufferMs;
		return { startMs, endMs };
	});

	const out: Date[] = [];
	for (const c of candidates) {
		const cStart = c.getTime();
		const cEnd = cStart + slotMs;
		let conflicts = false;
		for (const b of blocks) {
			if (cStart < b.endMs && cEnd > b.startMs) {
				conflicts = true;
				break;
			}
		}
		if (!conflicts) out.push(c);
	}
	return out;
}
