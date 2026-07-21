import type { PageLoad } from './$types';
import { SUGGESTED_JOB_TAGS } from '$lib/jobs/jobMeta';
import type { JobsFilterStatus } from '$lib/types/jobs';

export const ssr = false;

const STATUSES: readonly JobsFilterStatus[] = [
	'all',
	'unscheduled',
	'upcoming',
	'today',
	'late',
	'action_required',
	'completed',
	'cancelled',
	'deleted'
];

function parseStatus(v: string | null): JobsFilterStatus {
	return (STATUSES as readonly string[]).includes(v ?? '') ? (v as JobsFilterStatus) : 'all';
}

export const load: PageLoad = ({ url }) => {
	const known = new Set<string>(SUGGESTED_JOB_TAGS);
	return {
		q: url.searchParams.get('q') ?? '',
		status: parseStatus(url.searchParams.get('status')),
		assignedTo: url.searchParams.get('assigned_to') ?? '',
		dateFrom: url.searchParams.get('date_from') ?? '',
		dateTo: url.searchParams.get('date_to') ?? '',
		// Only echo back tags we recognise — keeps the URL from injecting arbitrary filters.
		tags: url.searchParams.getAll('tags').filter((t) => known.has(t))
	};
};
