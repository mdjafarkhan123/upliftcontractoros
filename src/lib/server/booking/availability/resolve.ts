// Availability resolution — override fully replaces weekly windows.
// Engine is stateless and uncached; callers fetch fresh on every request.

import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { availabilityOverrides, availabilityWindows } from '$lib/server/db/schema';
import type { IsoDate, ResolvedAvailability } from '../types';
import { dayOfWeekForLocalDate } from '../timezone/utils';

// Rule 2:
//   override exists & is_blocked=true  -> blocked (no slots)
//   override exists & is_blocked=false -> use override window only (no merge)
//   no override                        -> use weekly windows for day_of_week
//
// Defensive: an unblocked override with missing start/end is treated as blocked
// (no merging with weekly is permitted).
export async function resolveAvailabilityForDate(
	bookingLinkId: string,
	date: IsoDate
): Promise<ResolvedAvailability> {
	const [override] = await db
		.select({
			is_blocked: availabilityOverrides.is_blocked,
			start_time: availabilityOverrides.start_time,
			end_time: availabilityOverrides.end_time
		})
		.from(availabilityOverrides)
		.where(
			and(
				eq(availabilityOverrides.booking_link_id, bookingLinkId),
				sql`${availabilityOverrides.override_date} = ${date}::date`
			)
		)
		.limit(1);

	if (override) {
		if (override.is_blocked) return { blocked: true };
		if (!override.start_time || !override.end_time) return { blocked: true };
		return {
			blocked: false,
			windows: [{ start_time: override.start_time, end_time: override.end_time }]
		};
	}

	const dow = dayOfWeekForLocalDate(date);
	const rows = await db
		.select({
			start_time: availabilityWindows.start_time,
			end_time: availabilityWindows.end_time
		})
		.from(availabilityWindows)
		.where(
			and(
				eq(availabilityWindows.booking_link_id, bookingLinkId),
				eq(availabilityWindows.day_of_week, dow)
			)
		);

	if (rows.length === 0) return { blocked: false, windows: [] };
	return {
		blocked: false,
		windows: rows.map((r) => ({ start_time: r.start_time, end_time: r.end_time }))
	};
}

// Lightweight Tier 1 check — does this date have any weekly window OR a
// non-blocked override? Does NOT compute slots.
export async function hasAnyWindowForDate(
	bookingLinkId: string,
	date: IsoDate
): Promise<boolean> {
	const resolved = await resolveAvailabilityForDate(bookingLinkId, date);
	if (resolved.blocked) return false;
	return resolved.windows.length > 0;
}
