// Public surface of the booking availability engine.
// The engine is fully stateless — no caching of slots, dates, or DB results.
// Every public route call performs fresh DB reads. Slots are NEVER stored.

import type { BookingLink } from '$lib/server/db/schema';
import { resolveAvailabilityForDate } from './availability/resolve';
import { generateCandidateSlotsForDate } from './slots/generate';
import { detectConflicts } from './conflicts/detect';
import {
	assertDateBookable,
	filterByMinAdvance,
	isDatePotentiallyInRange
} from './validators';
import { enumerateDatesInMonth } from './timezone/utils';
import type { IsoDate, IsoMonth, ResolvedAvailability } from './types';

export type { IsoDate, IsoMonth };
export { BookingValidationError } from './types';

// Tier 2 — full slot generation for a single date.
// Returns sorted, de-duplicated UTC Date[] of valid slot starts.
export async function generateSlotsForDate(params: {
	orgId: string;
	timezone: string;
	bookingLink: Pick<
		BookingLink,
		'id' | 'slot_duration_minutes' | 'buffer_minutes' | 'min_advance_hours' | 'max_future_days'
	>;
	date: IsoDate;
}): Promise<Date[]> {
	const { orgId, timezone, bookingLink, date } = params;

	assertDateBookable(
		date,
		timezone,
		bookingLink.max_future_days,
		bookingLink.min_advance_hours
	);

	const resolved: ResolvedAvailability = await resolveAvailabilityForDate(
		bookingLink.id,
		date
	);
	if (resolved.blocked || resolved.windows.length === 0) return [];

	const candidates = generateCandidateSlotsForDate(
		date,
		timezone,
		resolved.windows,
		bookingLink.slot_duration_minutes,
		bookingLink.buffer_minutes
	);

	const afterMinAdvance = filterByMinAdvance(candidates, bookingLink.min_advance_hours);
	if (afterMinAdvance.length === 0) return [];

	return detectConflicts(
		orgId,
		date,
		timezone,
		afterMinAdvance,
		bookingLink.slot_duration_minutes,
		bookingLink.buffer_minutes
	);
}

// Tier 1 — lightweight calendar eligibility for a month.
// Does NOT query existing appointments. Returns sorted YYYY-MM-DD strings.
export async function getEligibleDatesForMonth(params: {
	timezone: string;
	bookingLink: Pick<
		BookingLink,
		'id' | 'min_advance_hours' | 'max_future_days'
	>;
	month: IsoMonth;
}): Promise<IsoDate[]> {
	const { timezone, bookingLink, month } = params;
	const dates = enumerateDatesInMonth(month);

	const inRange = dates.filter((d) =>
		isDatePotentiallyInRange(
			d,
			timezone,
			bookingLink.max_future_days,
			bookingLink.min_advance_hours
		)
	);

	const eligible: IsoDate[] = [];
	for (const d of inRange) {
		const resolved = await resolveAvailabilityForDate(bookingLink.id, d);
		if (resolved.blocked) continue;
		if (resolved.windows.length === 0) continue;
		eligible.push(d);
	}
	return eligible;
}
