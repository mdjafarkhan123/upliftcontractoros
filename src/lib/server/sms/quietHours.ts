import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * SMS quiet-hours compliance (Blueprint §10 / Onboarding.md Part 10).
 *
 * Outbound SMS is held during a contractor-configured window, always evaluated in
 * the org's own `timezone`. Hours are 0–23. `startHour > endHour` is an overnight
 * window (the TCPA-default case, 21 → 8); `startHour < endHour` is a same-day
 * window. Equal start/end means no quiet hours (never blocks).
 */

/** Read the current wall-clock hour (0–23) in the given IANA timezone. */
function hourInTimezone(now: Date, timezone: string): number {
	return Number(formatInTimeZone(now, timezone, 'H'));
}

/**
 * Whether `now` falls inside the org's quiet-hours window. Handles the overnight
 * wrap (start > end) and the same-day window (start < end). Returns false when the
 * window is degenerate (start === end).
 */
export function isWithinQuietHours(
	now: Date,
	timezone: string,
	startHour: number,
	endHour: number
): boolean {
	if (startHour === endHour) return false;
	const h = hourInTimezone(now, timezone);
	return startHour < endHour
		? h >= startHour && h < endHour // same-day window
		: h >= startHour || h < endHour; // overnight window
}

/**
 * Milliseconds from `now` until the quiet-hours window next opens for sending,
 * i.e. the next occurrence of `endHour:00` in `timezone`. Includes a 60s buffer so
 * a re-fired job lands safely past the boundary (and never re-evaluates as "still
 * within" on a boundary-second clock skew). Caller only invokes this while inside
 * the window, so the result is always > 0.
 */
export function msUntilQuietHoursEnd(now: Date, timezone: string, endHour: number): number {
	const h = hourInTimezone(now, timezone);
	// Target day in the org's timezone: today if the current local hour is still
	// before endHour (we're in the tail of an overnight window, or a same-day
	// window), otherwise tomorrow (start of an overnight window).
	const dayOffsetMs = h >= endHour ? 24 * 60 * 60 * 1000 : 0;
	const targetDay = formatInTimeZone(new Date(now.getTime() + dayOffsetMs), timezone, 'yyyy-MM-dd');
	const hh = String(endHour).padStart(2, '0');
	// Interpret `targetDay HH:00` as wall-clock in the org timezone → UTC instant.
	const windowOpensAt = fromZonedTime(`${targetDay} ${hh}:00:00`, timezone);
	const BUFFER_MS = 60 * 1000;
	return windowOpensAt.getTime() - now.getTime() + BUFFER_MS;
}
