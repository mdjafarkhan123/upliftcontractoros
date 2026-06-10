// Availability resolution — override fully replaces weekly windows.
// Engine is stateless and uncached; callers fetch fresh on every request.

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { availabilityOverrides, availabilityWindows } from '$lib/server/db/schema';
import type { IsoDate, ResolvedAvailability, TimeWindow } from '../types';
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
export async function hasAnyWindowForDate(bookingLinkId: string, date: IsoDate): Promise<boolean> {
	const resolved = await resolveAvailabilityForDate(bookingLinkId, date);
	if (resolved.blocked) return false;
	return resolved.windows.length > 0;
}

// Batch variant of resolveAvailabilityForDate — resolves many dates with exactly
// TWO queries (all weekly windows + all overrides in the requested set) instead
// of 1–2 queries per date. Used by the Tier 1 month-eligibility scan to avoid an
// N+1 round-trip storm. Resolution rules (Rule 2) mirror resolveAvailabilityForDate
// exactly: an override fully replaces weekly windows; a blocked override — or an
// unblocked override missing start/end — yields blocked.
export async function resolveAvailabilityForDates(
	bookingLinkId: string,
	dates: IsoDate[]
): Promise<Map<IsoDate, ResolvedAvailability>> {
	const result = new Map<IsoDate, ResolvedAvailability>();
	if (dates.length === 0) return result;

	// One query: every weekly window for the link, grouped by day_of_week.
	const windowRows = await db
		.select({
			day_of_week: availabilityWindows.day_of_week,
			start_time: availabilityWindows.start_time,
			end_time: availabilityWindows.end_time
		})
		.from(availabilityWindows)
		.where(eq(availabilityWindows.booking_link_id, bookingLinkId));

	const windowsByDow = new Map<number, TimeWindow[]>();
	for (const r of windowRows) {
		const list = windowsByDow.get(r.day_of_week) ?? [];
		list.push({ start_time: r.start_time, end_time: r.end_time });
		windowsByDow.set(r.day_of_week, list);
	}

	// One query: every override for the link within the requested dates.
	const overrideRows = await db
		.select({
			override_date: availabilityOverrides.override_date,
			is_blocked: availabilityOverrides.is_blocked,
			start_time: availabilityOverrides.start_time,
			end_time: availabilityOverrides.end_time
		})
		.from(availabilityOverrides)
		.where(
			and(
				eq(availabilityOverrides.booking_link_id, bookingLinkId),
				inArray(availabilityOverrides.override_date, dates)
			)
		);

	const overrideByDate = new Map<string, (typeof overrideRows)[number]>();
	for (const o of overrideRows) overrideByDate.set(o.override_date, o);

	for (const date of dates) {
		const override = overrideByDate.get(date);
		if (override) {
			// Blocked, or unblocked-but-missing-times → blocked (no merge with weekly).
			if (override.is_blocked || !override.start_time || !override.end_time) {
				result.set(date, { blocked: true });
			} else {
				result.set(date, {
					blocked: false,
					windows: [{ start_time: override.start_time, end_time: override.end_time }]
				});
			}
			continue;
		}

		const dow = dayOfWeekForLocalDate(date);
		const windows = windowsByDow.get(dow);
		result.set(date, {
			blocked: false,
			windows: windows ? windows.map((w) => ({ ...w })) : []
		});
	}

	return result;
}
