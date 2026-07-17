// Recurring-job visit engine.
//
// A recurring job stores its rule in `jobs.recurrence` (jsonb) and materializes
// every visit up-front as an `appointments` row (Jobber / Housecall Pro /
// ServiceTitan pattern) so each visit lands on the calendar and is individually
// reschedulable / completable / assignable. This file owns the pure date math:
// it takes the rule + an anchor instant and returns the concrete visit list.
//
// Time-zone note: all calendar reasoning is done with UTC field accessors so it
// is internally consistent and reversible. Each visit keeps the anchor's
// wall-clock time-of-day (in UTC terms). The viewing time-zone is a display
// concern handled the same way every other timestamptz in this app is.

export type RecurrenceFreq = 'day' | 'week' | 'month' | 'year';
export type MonthMode = 'day_of_month' | 'day_of_week';
export type EndType = 'after' | 'on';
export type EndUnit = 'days' | 'weeks' | 'months' | 'years';

// One tapped cell of the month "Day of week" grid: week 1..4 (1st..4th) × weekday 0..6 (Sun..Sat).
// The grid is a set of INDEPENDENT cells — "1st Monday + 3rd Thursday" is exactly two visits a
// month. This is why cells are pairs and not two separate lists (see month_weeks below).
export type MonthCell = { week: number; weekday: number };

export type JobRecurrence = {
	freq: RecurrenceFreq;
	// "Every N days / weeks / months / years".
	interval: number;
	// week mode — 0..6 (Sun..Sat), at least one.
	weekdays?: number[];
	// month mode.
	month_mode?: MonthMode;
	// day_of_month: 1..31 selections (+ month_last_day for "Last day").
	month_days?: number[];
	month_last_day?: boolean;
	// day_of_week ("nth weekday"): the tapped grid cells. Authoritative when present.
	month_cells?: MonthCell[];
	// LEGACY day_of_week shape (rules saved before the grid): two independent lists whose
	// CARTESIAN PRODUCT formed the occurrences — weeks {1,3} × days {Mon,Thu} meant four
	// visits a month, which the grid can no longer produce. Still read (and normalized into
	// cells) so existing recurring jobs keep expanding to the same dates. Never written.
	month_weeks?: number[];
	month_weekdays?: number[];
	// end condition.
	end_type: EndType;
	end_after_count?: number;
	end_after_unit?: EndUnit;
	end_on?: string; // 'YYYY-MM-DD'
	// Display-only: visit has no specific time. Does not affect generation
	// (the anchor instant already encodes the chosen time, or midnight).
	anytime?: boolean;
};

export type Visit = { start: Date; end: Date | null };

const MS_DAY = 86_400_000;
// Hard safety caps so a "forever" rule can never explode the calendar. The
// generator stops at whichever bound is hit first: the rule's own end, the
// 2-year horizon, or the visit count.
export const MAX_VISITS = 200;
const MAX_HORIZON_YEARS = 2;

// Add N calendar months to a UTC date, clamping the day to the target month's
// last day (Jan 31 + 1mo → Feb 28/29) — used only for the end horizon.
function addUtcMonths(d: Date, months: number): Date {
	const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
	const y = Math.floor(total / 12);
	const m = ((total % 12) + 12) % 12;
	const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
	const day = Math.min(d.getUTCDate(), lastDay);
	return new Date(
		Date.UTC(
			y,
			m,
			day,
			d.getUTCHours(),
			d.getUTCMinutes(),
			d.getUTCSeconds(),
			d.getUTCMilliseconds()
		)
	);
}

// Resolve the inclusive horizon instant: no visit may start after this.
function resolveHorizon(anchor: Date, rule: JobRecurrence): number {
	const cap = addUtcMonths(anchor, MAX_HORIZON_YEARS * 12).getTime();
	let horizon: number;
	if (rule.end_type === 'on' && rule.end_on) {
		const [y, m, d] = rule.end_on.split('-').map(Number);
		// End of the chosen day so a same-day visit is included.
		horizon = Date.UTC(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
	} else {
		const n = rule.end_after_count ?? 1;
		const unit = rule.end_after_unit ?? 'months';
		if (unit === 'days') horizon = anchor.getTime() + n * MS_DAY;
		else if (unit === 'weeks') horizon = anchor.getTime() + n * 7 * MS_DAY;
		else if (unit === 'years') horizon = addUtcMonths(anchor, n * 12).getTime();
		else horizon = addUtcMonths(anchor, n).getTime();
	}
	return Math.min(horizon, cap);
}

// The month "Day of week" selections as grid cells. New rules carry `month_cells`; legacy rules
// carry the two independent lists, which are expanded into their cartesian product here so they
// keep generating exactly the dates they always did.
export function monthCellsOf(rule: JobRecurrence): MonthCell[] {
	if (rule.month_cells?.length) return rule.month_cells;
	const weeks = rule.month_weeks ?? [];
	const weekdays = rule.month_weekdays ?? [];
	return weeks.flatMap((week) => weekdays.map((weekday) => ({ week, weekday })));
}

// Build a visit start at the given Y/M/D carrying the anchor's time-of-day.
function atAnchorTime(y: number, m: number, day: number, anchor: Date): Date {
	return new Date(
		Date.UTC(
			y,
			m,
			day,
			anchor.getUTCHours(),
			anchor.getUTCMinutes(),
			anchor.getUTCSeconds(),
			anchor.getUTCMilliseconds()
		)
	);
}

/**
 * Expand a recurrence rule into its concrete visit list, ascending by start.
 * Visits before the anchor instant are dropped; the anchor's own date is the
 * first eligible occurrence. Returns at most MAX_VISITS.
 */
export function expandRecurrence(
	anchorStart: Date,
	anchorEnd: Date | null,
	rule: JobRecurrence
): Visit[] {
	const horizonMs = resolveHorizon(anchorStart, rule);
	const durationMs =
		anchorEnd && anchorEnd.getTime() > anchorStart.getTime()
			? anchorEnd.getTime() - anchorStart.getTime()
			: null;
	const interval = Math.max(1, Math.floor(rule.interval || 1));
	const anchorMs = anchorStart.getTime();

	const starts: number[] = [];
	const seen = new Set<number>();
	const push = (vs: Date): boolean => {
		const t = vs.getTime();
		if (t < anchorMs || t > horizonMs) return true;
		if (!seen.has(t)) {
			seen.add(t);
			starts.push(t);
		}
		return starts.length < MAX_VISITS;
	};

	if (rule.freq === 'day') {
		// Every N days from the anchor. Whole-day steps in UTC keep the anchor's
		// time-of-day exactly (MS_DAY is a fixed 24h; DST is a display concern only).
		for (let i = 0; ; i++) {
			const t = anchorMs + i * interval * MS_DAY;
			if (t > horizonMs) break;
			if (!push(new Date(t))) break;
		}
	} else if (rule.freq === 'week') {
		const weekdays = (rule.weekdays ?? []).filter((d) => d >= 0 && d <= 6);
		// Midnight (UTC) of the Sunday that opens the anchor's week.
		const anchorMidnight = Date.UTC(
			anchorStart.getUTCFullYear(),
			anchorStart.getUTCMonth(),
			anchorStart.getUTCDate()
		);
		const sundayMs = anchorMidnight - anchorStart.getUTCDay() * MS_DAY;
		for (let w = 0; w <= 520; w++) {
			const weekStartMs = sundayMs + w * 7 * MS_DAY;
			if (weekStartMs > horizonMs) break;
			if (w % interval !== 0) continue;
			let room = true;
			for (const wd of weekdays) {
				const d = new Date(weekStartMs + wd * MS_DAY);
				room = push(atAnchorTime(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), anchorStart));
				if (!room) break;
			}
			if (!room) break;
		}
	} else if (rule.freq === 'year') {
		// Every N years on the anchor's own month + day-of-month. Feb 29 clamps to the 28th in a
		// common year (same rule addUtcMonths uses). Note MAX_HORIZON_YEARS caps generation at 2
		// years out, so a yearly rule materializes only its next few visits — the series is
		// re-expanded on edit, and the cap is the deliberate guard against a "forever" rule.
		const anchorY = anchorStart.getUTCFullYear();
		const anchorM = anchorStart.getUTCMonth();
		const anchorD = anchorStart.getUTCDate();
		for (let i = 0; ; i += interval) {
			const y = anchorY + i;
			if (Date.UTC(y, anchorM, 1) > horizonMs) break;
			const lastDay = new Date(Date.UTC(y, anchorM + 1, 0)).getUTCDate();
			if (!push(atAnchorTime(y, anchorM, Math.min(anchorD, lastDay), anchorStart))) break;
		}
	} else {
		const anchorMonthIdx = anchorStart.getUTCFullYear() * 12 + anchorStart.getUTCMonth();
		const mode: MonthMode = rule.month_mode ?? 'day_of_month';
		for (let mi = 0; mi <= 30; mi++) {
			const totalMonths = anchorMonthIdx + mi;
			const y = Math.floor(totalMonths / 12);
			const m = totalMonths % 12;
			if (Date.UTC(y, m, 1) > horizonMs) break;
			if (mi % interval !== 0) continue;
			const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
			let room = true;

			if (mode === 'day_of_month') {
				const days = [...(rule.month_days ?? [])];
				if (rule.month_last_day) days.push(lastDay);
				for (const day of days) {
					// A 31 in a 30-day month simply has no occurrence (Jobber skips it).
					if (day < 1 || day > lastDay) continue;
					room = push(atAnchorTime(y, m, day, anchorStart));
					if (!room) break;
				}
			} else {
				const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
				for (const { week, weekday } of monthCellsOf(rule)) {
					const day = 1 + ((weekday - firstDow + 7) % 7) + (week - 1) * 7;
					// A 5th-week cell simply has no occurrence in a short month (Jobber skips it).
					if (day > lastDay) continue;
					room = push(atAnchorTime(y, m, day, anchorStart));
					if (!room) break;
				}
			}
			if (!room) break;
		}
	}

	starts.sort((a, b) => a - b);
	return starts.map((t) => ({
		start: new Date(t),
		end: durationMs != null ? new Date(t + durationMs) : null
	}));
}
