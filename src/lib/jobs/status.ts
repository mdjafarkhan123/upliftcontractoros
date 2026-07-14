import type { JobStatus } from '$lib/types/jobs';

// The precise, user-facing state shown on a job (badge, tabs, KPI). A job's STORED status is the
// authority for the manual work states (in_progress / on_hold / completed / cancelled). A job that
// is still 'scheduled' shows one of four DATE-derived faces instead — matching Jobber's model:
//   • unscheduled — no date on the calendar yet
//   • upcoming    — has a future date
//   • today       — date is today, crew hasn't started
//   • overdue     — date has passed and it was never started/completed (money-at-risk flag)
// The moment the contractor taps "Start" the stored status becomes in_progress and the manual
// state wins here — so "Today until you start it, then In Progress" falls out for free.
export type JobScheduleState =
	| 'unscheduled'
	| 'upcoming'
	| 'today'
	| 'overdue'
	| 'in_progress'
	| 'on_hold'
	| 'completed'
	| 'cancelled';

// Derive the display state from the stored status + the job's single scheduled_start. `now` is
// injectable for consistent day boundaries / tests. Note: this reads the job's one date, so it is
// exact for single-visit jobs and an approximation for recurring/multi-visit jobs (the fully
// visit-accurate version is the larger schedule-hub work).
export function deriveJobScheduleState(
	status: JobStatus,
	scheduledStart: string | Date | null | undefined,
	now: Date = new Date()
): JobScheduleState {
	// Manual work states always win over the date-derived faces.
	if (status !== 'scheduled') return status;

	if (!scheduledStart) return 'unscheduled';

	const start = scheduledStart instanceof Date ? scheduledStart : new Date(scheduledStart);
	if (Number.isNaN(start.getTime())) return 'unscheduled';

	const dayStart = new Date(now);
	dayStart.setHours(0, 0, 0, 0);
	const dayEnd = new Date(now);
	dayEnd.setHours(23, 59, 59, 999);

	if (start > dayEnd) return 'upcoming';
	if (start >= dayStart) return 'today';
	return 'overdue';
}

const LABELS: Record<JobScheduleState, string> = {
	unscheduled: 'Unscheduled',
	upcoming: 'Upcoming',
	today: 'Today',
	overdue: 'Overdue',
	in_progress: 'In Progress',
	on_hold: 'On Hold',
	completed: 'Completed',
	cancelled: 'Cancelled'
};

export function jobScheduleStateLabel(state: JobScheduleState): string {
	return LABELS[state];
}
