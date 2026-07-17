// Request display status is DERIVED, never stored (Jobber: "nobody sets it by
// hand"). Stored facts (approval state, converted_*, archived_at) plus the
// linked assessment's schedule/completion state compute one of these labels.
// Shared by the list endpoint, the detail endpoint, and (later) the KPI counts
// so every surface agrees on what a request "is".

export type RequestDerivedStatus =
	| 'needs_approval'
	| 'new'
	| 'unscheduled'
	| 'upcoming'
	| 'today'
	| 'overdue'
	| 'assessment_completed'
	| 'converted'
	| 'archived';

export type RequestStatusFacts = {
	approval_state: 'not_required' | 'pending' | 'accepted' | 'declined';
	converted_at: Date | string | null;
	archived_at: Date | string | null;
};

// The linked assessment's contribution — a subset of the appointments row.
export type AssessmentStatusFacts = {
	status: 'scheduled' | 'unscheduled' | 'completed' | 'cancelled' | 'no_show';
	scheduled_start: Date | string | null;
	scheduled_end: Date | string | null;
	all_day: boolean;
};

// YYYY-MM-DD in the org's timezone — 'en-CA' formats as ISO so string
// comparison orders correctly. Same day-bucketing approach as the calendar.
function dayKey(d: Date, timezone: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(d);
}

export function deriveRequestStatus(
	request: RequestStatusFacts,
	assessment: AssessmentStatusFacts | null,
	opts: { timezone: string; now?: Date }
): RequestDerivedStatus {
	const now = opts.now ?? new Date();

	// Terminal first — a converted request never reverts, even if the quote/job
	// it produced is later deleted (Jobber rule, copied exactly).
	if (request.converted_at) return 'converted';
	if (request.archived_at) return 'archived';
	if (request.approval_state === 'pending') return 'needs_approval';

	// No assessment yet — or the planned one fell through (cancelled/no-show):
	// either way the request is back to needing action.
	if (!assessment || assessment.status === 'cancelled' || assessment.status === 'no_show') {
		return 'new';
	}
	if (assessment.status === 'completed') return 'assessment_completed';
	if (!assessment.scheduled_start) return 'unscheduled';

	const start = new Date(assessment.scheduled_start);
	const startDay = dayKey(start, opts.timezone);
	const nowDay = dayKey(now, opts.timezone);

	if (assessment.all_day) {
		// Anytime visit: only the DATE matters.
		if (startDay < nowDay) return 'overdue';
		return startDay === nowDay ? 'today' : 'upcoming';
	}

	// Timed visit: overdue once its window has fully passed and it wasn't completed.
	const end = assessment.scheduled_end ? new Date(assessment.scheduled_end) : start;
	if (end.getTime() < now.getTime()) return 'overdue';
	return startDay === nowDay ? 'today' : 'upcoming';
}
