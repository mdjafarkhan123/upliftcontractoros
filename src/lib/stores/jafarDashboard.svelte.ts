export type OrgRow = {
	id: string;
	name: string;
	slug: string;
	status: string;
	trade_type: string;
	is_setup_complete: boolean;
	created_at: string;
};

export type DeadLetterRow = {
	id: string;
	org_id: string | null;
	event_type: string;
	last_error: string | null;
	attempts: number;
	dead_lettered_at: string | null;
};

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

const TTL_MS = 30_000;
const TIMEOUT_MS = 10_000;

let orgs = $state<OrgRow[]>([]);
let deadLetters = $state<DeadLetterRow[]>([]);
let fetchedAt = $state(0);
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let activeController: AbortController | null = null;

async function fetchOnce(signal: AbortSignal) {
	const res = await fetch('/api/admin/orgs', { signal });
	if (!res.ok) {
		if (res.status === 401) throw new Error('UNAUTHORIZED');
		throw new Error('Failed to load admin dashboard.');
	}
	return (await res.json()) as { orgs: OrgRow[]; deadLetters: DeadLetterRow[] };
}

async function run(force: boolean) {
	const hasCache = fetchedAt > 0;
	const fresh = hasCache && Date.now() - fetchedAt < TTL_MS;
	if (fresh && !force) {
		status = 'ready';
		error = null;
		return;
	}

	if (activeController) activeController.abort();
	const controller = new AbortController();
	activeController = controller;

	status = hasCache ? 'revalidating' : 'loading';
	error = null;

	const timeout = setTimeout(() => {
		if (activeController === controller) {
			controller.abort();
			if (!hasCache) {
				status = 'error';
				error = 'Request timed out. Tap retry.';
			} else {
				status = 'ready';
				error = 'Background refresh timed out.';
			}
		}
	}, TIMEOUT_MS);

	try {
		const body = await fetchOnce(controller.signal);
		orgs = body.orgs;
		deadLetters = body.deadLetters;
		fetchedAt = Date.now();
		status = 'ready';
		error = null;
	} catch (e) {
		if ((e as { name?: string })?.name === 'AbortError') return;
		const msg = e instanceof Error ? e.message : 'Failed to load admin dashboard.';
		error = msg;
		status = hasCache ? 'ready' : 'error';
	} finally {
		clearTimeout(timeout);
		if (activeController === controller) activeController = null;
	}
}

export const jafarDashboardStore = {
	get orgs() {
		return orgs;
	},
	get deadLetters() {
		return deadLetters;
	},
	get status() {
		return status;
	},
	get error() {
		return error;
	},
	get hasCache() {
		return fetchedAt > 0;
	},

	async load(): Promise<void> {
		await run(false);
	},

	async refresh(): Promise<void> {
		await run(true);
	}
};
