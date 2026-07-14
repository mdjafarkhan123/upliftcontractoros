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

export type RecurrenceFreq = 'week' | 'month';
export type MonthMode = 'day_of_month' | 'day_of_week';
export type EndType = 'after' | 'on';
export type EndUnit = 'days' | 'weeks' | 'months' | 'years';

export type JobRecurrence = {
	freq: RecurrenceFreq;
	// "Every N weeks / months".
	interval: number;
	// week mode — 0..6 (Sun..Sat), at least one.
	weekdays?: number[];
	// month mode.
	month_mode?: MonthMode;
	// day_of_month: 1..31 selections (+ month_last_day for "Last day").
	month_days?: number[];
	month_last_day?: boolean;
	// day_of_week ("nth weekday"): weeks 1..4 (1st..4th) × weekdays 0..6.
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
		Date.UTC(y, m, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds())
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

	if (rule.freq === 'week') {
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
				for (const wk of rule.month_weeks ?? []) {
					for (const wd of rule.month_weekdays ?? []) {
						const day = 1 + ((wd - firstDow + 7) % 7) + (wk - 1) * 7;
						if (day > lastDay) continue;
						room = push(atAnchorTime(y, m, day, anchorStart));
						if (!room) break;
					}
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
