// Timezone-aware date math for the booking engine.
// All conversions go through date-fns-tz. Never use server system timezone.
// Never add/subtract fixed hour offsets — DST transitions are handled by the library.
// Engine is stateless; no caching of computed dates.

import { fromZonedTime, toZonedTime, format as formatTz } from 'date-fns-tz';
import { addDays, addMinutes } from 'date-fns';
import { BookingValidationError, type IsoDate, type IsoMonth } from '../types';

// date-fns-tz v3 renamed zonedTimeToUtc → fromZonedTime and
// utcToZonedTime → toZonedTime. Behavior matches the v2 names called out in the spec.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH_RE = /^\d{4}-\d{2}$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function assertIsoDate(value: string, field = 'date'): IsoDate {
	if (!ISO_DATE_RE.test(value)) {
		throw new BookingValidationError('Invalid date format (expected YYYY-MM-DD)', field);
	}
	const [y, m, d] = value.split('-').map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	if (
		dt.getUTCFullYear() !== y ||
		dt.getUTCMonth() !== m - 1 ||
		dt.getUTCDate() !== d
	) {
		throw new BookingValidationError('Invalid calendar date', field);
	}
	return value;
}

export function assertIsoMonth(value: string, field = 'month'): IsoMonth {
	if (!ISO_MONTH_RE.test(value)) {
		throw new BookingValidationError('Invalid month format (expected YYYY-MM)', field);
	}
	const [y, m] = value.split('-').map(Number);
	if (m < 1 || m > 12 || y < 1970 || y > 9999) {
		throw new BookingValidationError('Invalid month value', field);
	}
	return value;
}

// Today's date (YYYY-MM-DD) in the org's timezone.
export function todayInOrgTz(timezone: string): IsoDate {
	return formatTz(toZonedTime(new Date(), timezone), 'yyyy-MM-dd', { timeZone: timezone });
}

// Current instant — returned as a UTC Date (Date is always UTC internally).
export function nowUtc(): Date {
	return new Date();
}

// Convert a (date YYYY-MM-DD, time HH:mm[:ss]) pair in the org tz to a UTC Date.
// DST-safe: fromZonedTime resolves the wall-clock instant in the named zone.
export function zonedDateTimeToUtc(
	date: IsoDate,
	time: string,
	timezone: string
): Date {
	const match = TIME_RE.exec(time);
	if (!match) throw new BookingValidationError(`Invalid time: ${time}`);
	const hh = match[1];
	const mm = match[2];
	const ss = match[3] ?? '00';
	// fromZonedTime accepts an ISO-like string + zone and returns the UTC instant.
	return fromZonedTime(`${date}T${hh}:${mm}:${ss}`, timezone);
}

// Day of week 0..6 (Sunday=0) for an IsoDate in the org's timezone.
// Computed from the calendar date itself (no timezone shift needed since the date
// is already expressed in the org's local calendar).
export function dayOfWeekForLocalDate(date: IsoDate): number {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// UTC instant for the start of the given local date in the org's timezone.
export function startOfLocalDayUtc(date: IsoDate, timezone: string): Date {
	return fromZonedTime(`${date}T00:00:00`, timezone);
}

// UTC instant for the start of the NEXT local date in the org's timezone.
// Use as an exclusive upper bound: dayStartUtc <= scheduled_start < nextDayStartUtc.
export function startOfNextLocalDayUtc(date: IsoDate, timezone: string): Date {
	const [y, m, d] = date.split('-').map(Number);
	const next = new Date(Date.UTC(y, m - 1, d + 1));
	const nextStr = formatTz(next, 'yyyy-MM-dd', { timeZone: 'UTC' });
	return fromZonedTime(`${nextStr}T00:00:00`, timezone);
}

// Earliest bookable UTC instant given the min_advance_hours rule.
export function earliestBookableUtc(minAdvanceHours: number): Date {
	return addMinutes(nowUtc(), Math.max(0, minAdvanceHours) * 60);
}

// Add N days to an IsoDate in the local calendar (no tz shift).
export function addDaysToIsoDate(date: IsoDate, days: number): IsoDate {
	const [y, m, d] = date.split('-').map(Number);
	const next = addDays(new Date(Date.UTC(y, m - 1, d)), days);
	return formatTz(next, 'yyyy-MM-dd', { timeZone: 'UTC' });
}

// All YYYY-MM-DD dates in the given month (according to local calendar — months
// have the same day count regardless of timezone).
export function enumerateDatesInMonth(month: IsoMonth): IsoDate[] {
	const [y, m] = month.split('-').map(Number);
	const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
	const dates: IsoDate[] = [];
	for (let d = 1; d <= daysInMonth; d++) {
		dates.push(
			`${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`
		);
	}
	return dates;
}

// True if dateA <= dateB (lexicographic works for YYYY-MM-DD).
export function isoDateLte(a: IsoDate, b: IsoDate): boolean {
	return a <= b;
}
