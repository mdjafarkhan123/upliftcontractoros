import type { PageLoad } from './$types';
import { isLeadSource } from '$lib/contacts/leadSource';

export const ssr = false;

const STATUSES = ['all', 'leads', 'customers', 'archived', 'deleted'] as const;
const SCOPES = ['mine', 'team', 'unassigned'] as const;
const TEMPERATURES = ['', 'hot', 'warm', 'cold'] as const;
type Status = (typeof STATUSES)[number];
type Scope = (typeof SCOPES)[number];
type Temperature = (typeof TEMPERATURES)[number];

function parseStatus(v: string | null): Status {
	return (STATUSES as readonly string[]).includes(v ?? '') ? (v as Status) : 'all';
}
function parseScope(v: string | null): Scope {
	return (SCOPES as readonly string[]).includes(v ?? '') ? (v as Scope) : 'team';
}
function parseTemperature(v: string | null): Temperature {
	const val = v ?? '';
	return (TEMPERATURES as readonly string[]).includes(val) ? (val as Temperature) : '';
}

export const load: PageLoad = ({ url }) => {
	return {
		q: url.searchParams.get('q') ?? '',
		statusFilter: parseStatus(url.searchParams.get('status')),
		tag: url.searchParams.get('tag') ?? '',
		temperature: parseTemperature(url.searchParams.get('temp')),
		source: isLeadSource(url.searchParams.get('source')) ? url.searchParams.get('source')! : '',
		followUp: url.searchParams.get('follow_up') === 'overdue',
		scope: parseScope(url.searchParams.get('scope'))
	};
};
