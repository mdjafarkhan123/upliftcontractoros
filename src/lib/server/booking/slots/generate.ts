// Raw candidate slot generation. Engine is stateless and uncached.
// Generates UTC instants only; formatting for display is the UI's responsibility.

import { addMinutes } from 'date-fns';
import type { IsoDate, TimeWindow } from '../types';
import { zonedDateTimeToUtc } from '../timezone/utils';

// Rule 3:
//   slot_start + slot_duration_minutes <= window_end       (valid)
//   step = slot_duration_minutes + buffer_minutes          (advance)
//   buffer applies only between slots (and conflicts) — NOT to window boundaries.
//
// Slots from multiple windows on the same day are produced independently then
// merged + de-duplicated by the caller (generateCandidateSlotsForDate below).
export function generateSlotsForWindow(
	date: IsoDate,
	timezone: string,
	window: TimeWindow,
	slotDurationMinutes: number,
	bufferMinutes: number
): Date[] {
	if (slotDurationMinutes <= 0) return [];

	const windowStartUtc = zonedDateTimeToUtc(date, window.start_time, timezone);
	const windowEndUtc = zonedDateTimeToUtc(date, window.end_time, timezone);

	if (windowEndUtc.getTime() <= windowStartUtc.getTime()) return [];

	const step = slotDurationMinutes + Math.max(0, bufferMinutes);
	const slots: Date[] = [];

	let cursor = windowStartUtc;
	while (true) {
		const slotEnd = addMinutes(cursor, slotDurationMinutes);
		if (slotEnd.getTime() > windowEndUtc.getTime()) break;
		slots.push(cursor);
		cursor = addMinutes(cursor, step);
	}
	return slots;
}

// Generate, merge, sort, and de-dupe candidate slots across all windows for a date.
export function generateCandidateSlotsForDate(
	date: IsoDate,
	timezone: string,
	windows: TimeWindow[],
	slotDurationMinutes: number,
	bufferMinutes: number
): Date[] {
	const all: Date[] = [];
	for (const w of windows) {
		all.push(...generateSlotsForWindow(date, timezone, w, slotDurationMinutes, bufferMinutes));
	}
	all.sort((a, b) => a.getTime() - b.getTime());
	const deduped: Date[] = [];
	let lastTs = -1;
	for (const s of all) {
		const ts = s.getTime();
		if (ts !== lastTs) {
			deduped.push(s);
			lastTs = ts;
		}
	}
	return deduped;
}
