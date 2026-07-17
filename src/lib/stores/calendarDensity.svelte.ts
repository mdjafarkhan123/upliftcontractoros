import { browser } from '$app/environment';
import type { CalendarDensity } from '$lib/types/appointments';

const STORAGE_KEY = 'cos-cal-density';

// Hour-row pixel heights per density. Kept here so the store is the single
// source of truth the grid reads from.
//
// Spacious is 110px on purpose: a 1-hour visit then clears the ~98px the card's
// 4-row layout needs, so it shows everything. Density does NOT choose the layout —
// it only sets px-per-hour. The card measures ITSELF and reveals rows by priority
// (see the `@container cal-card` ladder in _appointments.scss), so a 30-min visit
// is 55px even in Spacious and correctly shows less, while a 3-hour visit in
// Compact shows everything.
export const DENSITY_HOUR_HEIGHT: Record<CalendarDensity, number> = {
	compact: 51,
	comfortable: 72,
	spacious: 110
};

// The shortest a visit card may be DRAWN, per density: exactly one readable line
// of its own text — card padding + (font-size x line-height) + borders. A 15-min
// visit is only ~18px of real estate, so the grid deliberately draws it taller
// than its true duration (Google Calendar does the same); the alternative is
// slicing the title through the middle, which reads as a rendering bug.
// Keep these in step with the card's padding/font-size in _appointments.scss.
// Card text is 14px in EVERY density (never 16px), so the only variable here is
// the card's padding: 14 x 1.25 line + 2px borders + the mode's padding.
export const DENSITY_MIN_BLOCK_PX: Record<CalendarDensity, number> = {
	compact: 26, // 3+3 padding
	comfortable: 30, // 5+5 padding
	spacious: 34 // 7+7 padding
};

function readInitial(): CalendarDensity {
	if (!browser) return 'comfortable';
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'compact' || stored === 'comfortable' || stored === 'spacious') {
		return stored;
	}
	return 'comfortable';
}

function createCalendarDensity() {
	const initial = readInitial();
	let value = $state<CalendarDensity>(initial);

	return {
		get value() {
			return value;
		},
		set(next: CalendarDensity) {
			value = next;
			if (browser) localStorage.setItem(STORAGE_KEY, next);
		}
	};
}

export const calendarDensity = createCalendarDensity();
