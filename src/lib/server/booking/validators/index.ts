// Server-side booking rule enforcement. Never trust frontend date disabling.
// Stateless; no caching.

import { addMinutes } from 'date-fns';
import { BookingValidationError, type IsoDate } from '../types';
import {
	addDaysToIsoDate,
	earliestBookableUtc,
	startOfLocalDayUtc,
	startOfNextLocalDayUtc,
	todayInOrgTz,
	isoDateLte
} from '../timezone/utils';

// Reject any date before today in the org's timezone.
export function assertDateNotInPast(
	date: IsoDate,
	timezone: string,
	field = 'date'
): void {
	const today = todayInOrgTz(timezone);
	if (!isoDateLte(today, date)) {
		throw new BookingValidationError('Date is in the past', field);
	}
}

// Reject any date beyond max_future_days from today (org tz).
export function assertDateWithinMaxFuture(
	date: IsoDate,
	timezone: string,
	maxFutureDays: number,
	field = 'date'
): void {
	const today = todayInOrgTz(timezone);
	const limit = addDaysToIsoDate(today, Math.max(0, maxFutureDays));
	if (!isoDateLte(date, limit)) {
		throw new BookingValidationError('Date is beyond the booking window', field);
	}
}

// Reject any date where the entire day is before the min_advance cutoff
// (i.e. the day has ended before the earliest bookable instant).
export function assertDateNotFullyPastCutoff(
	date: IsoDate,
	timezone: string,
	minAdvanceHours: number,
	field = 'date'
): void {
	const cutoff = earliestBookableUtc(minAdvanceHours);
	const nextDayStart = startOfNextLocalDayUtc(date, timezone);
	if (nextDayStart.getTime() <= cutoff.getTime()) {
		throw new BookingValidationError(
			'No bookable time remaining on this date',
			field
		);
	}
}

// Composite check used by /slots before running the engine.
export function assertDateBookable(
	date: IsoDate,
	timezone: string,
	maxFutureDays: number,
	minAdvanceHours: number
): void {
	assertDateNotInPast(date, timezone);
	assertDateWithinMaxFuture(date, timezone, maxFutureDays);
	assertDateNotFullyPastCutoff(date, timezone, minAdvanceHours);
}

// Tier 1 helper: is this date potentially available based purely on range +
// cutoff (no DB lookups)? Used for calendar rendering eligibility.
export function isDatePotentiallyInRange(
	date: IsoDate,
	timezone: string,
	maxFutureDays: number,
	minAdvanceHours: number
): boolean {
	const today = todayInOrgTz(timezone);
	if (!isoDateLte(today, date)) return false;
	const limit = addDaysToIsoDate(today, Math.max(0, maxFutureDays));
	if (!isoDateLte(date, limit)) return false;
	const cutoff = earliestBookableUtc(minAdvanceHours);
	const nextDayStart = startOfNextLocalDayUtc(date, timezone);
	if (nextDayStart.getTime() <= cutoff.getTime()) return false;
	return true;
}

// Filter UTC candidate slots by the min_advance cutoff (Rule 4). Applies to all
// dates but only has an effect when the cutoff falls within the day.
export function filterByMinAdvance(
	candidates: Date[],
	minAdvanceHours: number
): Date[] {
	const cutoff = earliestBookableUtc(minAdvanceHours).getTime();
	return candidates.filter((c) => c.getTime() >= cutoff);
}

// Re-export for convenience.
export { addMinutes };
