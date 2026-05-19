import type { PageLoad } from './$types';
import type { StatusFilter, AssigneeFilter } from '$lib/stores/inbox.svelte';

export const ssr = false;

const STATUS_VALUES: readonly StatusFilter[] = ['open', 'snoozed', 'closed', 'all'];

function parseStatus(value: string | null): StatusFilter {
	if (value && (STATUS_VALUES as readonly string[]).includes(value)) {
		return value as StatusFilter;
	}
	return 'open';
}

function parseAssignee(value: string | null): AssigneeFilter {
	if (!value) return 'all';
	return value as AssigneeFilter;
}

export const load: PageLoad = ({ url }) => {
	return {
		status: parseStatus(url.searchParams.get('status')),
		assignee: parseAssignee(url.searchParams.get('assignee')),
		unread: url.searchParams.get('unread') === '1',
		q: url.searchParams.get('q') ?? ''
	};
};
