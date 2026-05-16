import type { PlanName } from '$lib/admin/planTemplates';
import type { FeatureFlags, OrgLimits } from '$lib/types';

export type Org = {
	id: string;
	name: string;
	slug: string;
	status: 'active' | 'suspended' | 'pending_deletion' | 'deleted';
	trade_type: string;
	city: string | null;
	state: string | null;
	timezone: string;
	twilio_phone_number: string;
	is_setup_complete: boolean;
	created_at: string;
	updated_at: string;
	plan: PlanName;
	integration_status: Record<string, unknown>;
	feature_overrides_updated_at: string | null;
	widget_token: string;
} & FeatureFlags &
	OrgLimits;

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

type Cached = { org: Org; fetchedAt: number };

const TTL_MS = 30_000;
const TIMEOUT_MS = 10_000;

// Per-id cache (plain object, NOT reactive — only the active slot drives the UI).
const cache = new Map<string, Cached>();

// Reactive slot for the currently viewed org.
let currentId = $state<string | null>(null);
let org = $state<Org | null>(null);
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let activeController: AbortController | null = null;

async function fetchOnce(id: string, signal: AbortSignal): Promise<Org> {
	const res = await fetch(`/api/admin/orgs/${id}`, { signal });
	if (!res.ok) {
		if (res.status === 401) throw new Error('UNAUTHORIZED');
		if (res.status === 404) throw new Error('Organization not found.');
		throw new Error('Failed to load organization.');
	}
	const body = (await res.json()) as { org: Org };
	return body.org;
}

async function run(id: string, force: boolean): Promise<void> {
	// Switching id: drop previous reactive state, hydrate from cache if we have it.
	if (currentId !== id) {
		currentId = id;
		const cached = cache.get(id);
		org = cached?.org ?? null;
		status = cached ? 'ready' : 'loading';
		error = null;
	}

	const cached = cache.get(id);
	const fresh = cached && Date.now() - cached.fetchedAt < TTL_MS;
	if (fresh && !force) {
		status = 'ready';
		error = null;
		return;
	}

	if (activeController) activeController.abort();
	const controller = new AbortController();
	activeController = controller;

	status = cached ? 'revalidating' : 'loading';
	error = null;

	const timeout = setTimeout(() => {
		if (activeController === controller) {
			controller.abort();
			if (!cached) {
				status = 'error';
				error = 'Request timed out. Tap retry.';
			} else {
				status = 'ready';
				error = 'Background refresh timed out.';
			}
		}
	}, TIMEOUT_MS);

	try {
		const fetched = await fetchOnce(id, controller.signal);
		if (currentId !== id) return; // user navigated away
		cache.set(id, { org: fetched, fetchedAt: Date.now() });
		org = fetched;
		status = 'ready';
		error = null;
	} catch (e) {
		if ((e as { name?: string })?.name === 'AbortError') return;
		if (currentId !== id) return;
		const msg = e instanceof Error ? e.message : 'Failed to load organization.';
		error = msg;
		status = cached ? 'ready' : 'error';
	} finally {
		clearTimeout(timeout);
		if (activeController === controller) activeController = null;
	}
}

export const jafarOrgStore = {
	get currentId() {
		return currentId;
	},
	get org() {
		return org;
	},
	get status() {
		return status;
	},
	get error() {
		return error;
	},

	async load(id: string): Promise<void> {
		await run(id, false);
	},

	async refresh(id: string): Promise<void> {
		await run(id, true);
	}
};
