import type { EventListItem } from '$lib/types/events';

// Jobber marks an `Event` complete AUTOMATICALLY once its window has passed — an event
// has no manual "complete" action (unlike a visit, which a person checks off). So an
// event's completed state is derived purely from its own clock, never stored.
//
// Window close mirrors `deriveVisitCardState`: an all-day (or end-less) event closes at
// the end of its start day; a timed event closes at `end_at`. `now` is injectable so a
// render pass shares one clock (and it's testable). An unscheduled event (no start) is
// never auto-complete.
export function isEventPast(
	event: Pick<EventListItem, 'start_at' | 'end_at' | 'all_day'>,
	now: Date = new Date()
): boolean {
	if (!event.start_at) return false;
	const start = new Date(event.start_at);
	if (Number.isNaN(start.getTime())) return false;

	let windowEnd: Date;
	if (event.all_day || !event.end_at) {
		windowEnd = new Date(start);
		windowEnd.setHours(23, 59, 59, 999);
	} else {
		windowEnd = new Date(event.end_at);
		if (Number.isNaN(windowEnd.getTime())) {
			windowEnd = new Date(start);
			windowEnd.setHours(23, 59, 59, 999);
		}
	}

	return now > windowEnd;
}
