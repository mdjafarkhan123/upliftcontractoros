import type { PageLoad } from './$types';

export const ssr = false;

const STATUSES = ['all', 'leads', 'customers', 'archived'] as const;
const SCOPES = ['mine', 'team', 'unassigned'] as const;
type Status = (typeof STATUSES)[number];
type Scope = (typeof SCOPES)[number];

function parseStatus(v: string | null): Status {
	return (STATUSES as readonly string[]).includes(v ?? '') ? (v as Status) : 'all';
}
function parseScope(v: string | null): Scope {
	return (SCOPES as readonly string[]).includes(v ?? '') ? (v as Scope) : 'team';
}

export const load: PageLoad = ({ url }) => {
	return {
		q: url.searchParams.get('q') ?? '',
		statusFilter: parseStatus(url.searchParams.get('status')),
		tag: url.searchParams.get('tag') ?? '',
		scope: parseScope(url.searchParams.get('scope'))
	};
};
