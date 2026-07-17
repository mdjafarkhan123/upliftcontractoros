// Client-side mirror of the server JobRecurrence shape ($lib/server/jobs/recurrence.ts,
// which is server-only and cannot be imported into .svelte). The "New Job" page builds
// one of these objects and POSTs it; these helpers turn it into human labels for the
// "Repeats …" field and the live summary line. The actual visit count comes from the
// server preview endpoint, never recomputed here.

export type RecurrenceFreq = 'day' | 'week' | 'month' | 'year';
export type MonthMode = 'day_of_month' | 'day_of_week';
export type EndType = 'after' | 'on';
export type EndUnit = 'days' | 'weeks' | 'months' | 'years';

// One tapped cell of the month "Day of week" grid: week 1..4 × weekday 0..6 (Sun..Sat).
export type MonthCell = { week: number; weekday: number };

export type JobRecurrence = {
	freq: RecurrenceFreq;
	interval: number;
	weekdays?: number[];
	month_mode?: MonthMode;
	month_days?: number[];
	month_last_day?: boolean;
	month_cells?: MonthCell[];
	// Legacy day_of_week shape (cartesian weeks × weekdays) — read-only, see the server mirror.
	month_weeks?: number[];
	month_weekdays?: number[];
	end_type: EndType;
	end_after_count?: number;
	end_after_unit?: EndUnit;
	end_on?: string;
	anytime?: boolean;
};

// Single-letter pill labels (Sun-first), matching the reference S M T W T F S row.
export const WEEKDAY_PILLS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAY_LONG = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
] as const;
const NTH = ['1st', '2nd', '3rd', '4th'] as const;

function ordinal(n: number): string {
	const s = ['th', 'st', 'nd', 'rd'];
	const v = n % 100;
	return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function joinList(parts: string[]): string {
	if (parts.length <= 1) return parts.join('');
	if (parts.length === 2) return parts.join(' & ');
	return parts.slice(0, -1).join(', ') + ' & ' + parts[parts.length - 1];
}

// Full sentence for the "Repeats" field, e.g. "Weekly on Saturdays",
// "Every 2 weeks on Mon & Wed", "Monthly on the last day",
// "Monthly on the 1st & 3rd Monday".
// Mirror of the server's monthCellsOf: new rules carry `month_cells`; legacy rules are
// normalized from their cartesian weeks × weekdays lists so old jobs still read correctly.
export function monthCellsOf(r: JobRecurrence): MonthCell[] {
	if (r.month_cells?.length) return r.month_cells;
	const weeks = r.month_weeks ?? [];
	const weekdays = r.month_weekdays ?? [];
	return weeks.flatMap((week) => weekdays.map((weekday) => ({ week, weekday })));
}

export function summarizeRecurrence(r: JobRecurrence): string {
	const n = Math.max(1, Math.floor(r.interval || 1));
	if (r.freq === 'day') {
		return n === 1 ? 'Daily' : `Every ${n} days`;
	}
	if (r.freq === 'year') {
		return n === 1 ? 'Yearly' : `Every ${n} years`;
	}
	if (r.freq === 'week') {
		const days = (r.weekdays ?? []).slice().sort((a, b) => a - b);
		const dayText = days.length === 0 ? '—' : joinList(days.map((d) => WEEKDAY_SHORT[d] ?? ''));
		if (n === 1) {
			// "Weekly on Saturdays" reads nicest for a single day.
			if (days.length === 1) return `Weekly on ${WEEKDAY_LONG[days[0]]}s`;
			return `Weekly on ${dayText}`;
		}
		return `Every ${n} weeks on ${dayText}`;
	}
	// month
	const prefix = n === 1 ? 'Monthly' : `Every ${n} months`;
	if ((r.month_mode ?? 'day_of_month') === 'day_of_month') {
		const days = (r.month_days ?? []).slice().sort((a, b) => a - b);
		const labels = days.map((d) => ordinal(d));
		if (r.month_last_day) labels.push('last day');
		if (labels.length === 0) return `${prefix}`;
		return `${prefix} on the ${joinList(labels)}`;
	}
	// Each grid cell reads as its own occurrence: "Monthly on the 1st Monday & 3rd Thursday".
	const cells = monthCellsOf(r)
		.slice()
		.sort((a, b) => a.week - b.week || a.weekday - b.weekday);
	if (cells.length === 0) return prefix;
	const cellText = joinList(
		cells.map((c) => `${NTH[c.week - 1] ?? `${c.week}th`} ${WEEKDAY_LONG[c.weekday] ?? ''}`.trim())
	);
	return `${prefix} on the ${cellText}`;
}

// Compact tail for the summary strip, e.g. "Repeats weekly on Sat".
export function shortRepeatLabel(r: JobRecurrence): string {
	const n = Math.max(1, Math.floor(r.interval || 1));
	if (r.freq === 'day') {
		return n === 1 ? 'Repeats daily' : `Repeats every ${n} days`;
	}
	if (r.freq === 'year') {
		return n === 1 ? 'Repeats yearly' : `Repeats every ${n} years`;
	}
	if (r.freq === 'week') {
		const days = (r.weekdays ?? []).slice().sort((a, b) => a - b);
		const dayText = days.length ? joinList(days.map((d) => WEEKDAY_SHORT[d] ?? '')) : '—';
		return n === 1 ? `Repeats weekly on ${dayText}` : `Repeats every ${n} weeks on ${dayText}`;
	}
	return n === 1 ? 'Repeats monthly' : `Repeats every ${n} months`;
}
