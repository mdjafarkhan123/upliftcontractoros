import type { AppointmentListItem } from '$lib/types/appointments';

// The state a calendar card paints. This mirrors Jobber's `VisitStatusTypeEnum`
// (UPCOMING / TODAY / LATE / COMPLETED, plus our own cancelled / no_show tails):
// only `completed`, `cancelled` and `no_show` are STORED facts — the rest are
// derived from the visit's own clock, exactly as Jobber derives them.
//
// Deliberately absent: "In Progress". Jobber has no in-progress state on a visit,
// and our `Start job` button flips the JOB — so a recurring job would paint every
// one of its visits as started, including next month's. When we build the dispatch
// board it belongs there as a real per-visit signal, not as a guess made here.
export type VisitCardState =
	| 'scheduled' // open, starts on a later day
	| 'today' // open, happening today, end time not yet passed
	| 'late' // open, end time passed and nobody marked it complete
	| 'completed'
	| 'cancelled'
	| 'no_show';

const LABELS: Record<VisitCardState, string> = {
	scheduled: 'Scheduled',
	today: 'Today',
	late: 'Late',
	completed: 'Completed',
	cancelled: 'Cancelled',
	no_show: 'No show'
};

export function visitCardStateLabel(state: VisitCardState): string {
	return LABELS[state];
}

// The glyph pinned to the card's top-right corner. It is the RECURRING icon on an
// open visit, and is REPLACED by the outcome once the visit is closed — the corner
// only ever holds one mark, and a finished visit's outcome outranks the fact that
// it repeats.
const ICONS: Record<VisitCardState, string | null> = {
	scheduled: null,
	today: null,
	late: null,
	completed: 'ri-check-line',
	cancelled: 'ri-close-line',
	no_show: 'ri-alert-line'
};

export function visitCardStateIcon(state: VisitCardState): string | null {
	return ICONS[state];
}

function sameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

// `now` is injectable so the day boundary is consistent across a render pass (and
// testable). An Anytime visit has no end time, so its window closes at midnight:
// it reads Today all day, then Late tomorrow.
export function deriveVisitCardState(
	appt: Pick<AppointmentListItem, 'status' | 'scheduled_start' | 'scheduled_end' | 'all_day'>,
	now: Date = new Date()
): VisitCardState {
	if (appt.status === 'completed') return 'completed';
	if (appt.status === 'cancelled') return 'cancelled';
	if (appt.status === 'no_show') return 'no_show';

	const start = new Date(appt.scheduled_start);
	if (Number.isNaN(start.getTime())) return 'scheduled';

	// The moment the visit stops being "on time". Jobber's LATE keys off the END of
	// the window, not the start — a job that finishes at 5pm is not late at 4pm.
	let windowEnd: Date;
	if (appt.all_day || !appt.scheduled_end) {
		windowEnd = new Date(start);
		windowEnd.setHours(23, 59, 59, 999);
	} else {
		windowEnd = new Date(appt.scheduled_end);
		if (Number.isNaN(windowEnd.getTime())) {
			windowEnd = new Date(start);
			windowEnd.setHours(23, 59, 59, 999);
		}
	}

	if (now > windowEnd) return 'late';
	if (sameDay(start, now)) return 'today';
	// Past-dated visit whose window somehow hasn't closed can't exist, so anything
	// left is a future day.
	return 'scheduled';
}
