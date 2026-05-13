import type { Org, OrgMember, FeatureFlags, OrgLimits, IntegrationStatus } from '$lib/types';

export type AppSessionData = {
	org: Org;
	member: OrgMember;
	featureFlags: FeatureFlags;
	limits: OrgLimits;
	integrationStatus: IntegrationStatus;
};

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'unauthorized' | 'error';

let data = $state<AppSessionData | null>(null);
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let lastFetchedAt = $state(0);
let inflight: Promise<AppSessionData | null> | null = null;

const TTL_MS = 5 * 60 * 1000;

async function run(): Promise<AppSessionData | null> {
	try {
		const res = await fetch('/api/session');
		if (res.status === 401) {
			data = null;
			status = 'unauthorized';
			error = 'unauthorized';
			return null;
		}
		if (!res.ok) {
			status = data ? 'ready' : 'error';
			error = 'Failed to load session';
			return data;
		}
		data = (await res.json()) as AppSessionData;
		lastFetchedAt = Date.now();
		status = 'ready';
		error = null;
		return data;
	} catch (e) {
		status = data ? 'ready' : 'error';
		error = e instanceof Error ? e.message : 'Failed to load session';
		return data;
	} finally {
		inflight = null;
	}
}

export const sessionStore = {
	get data() {
		return data;
	},
	get status() {
		return status;
	},
	get error() {
		return error;
	},
	get lastFetchedAt() {
		return lastFetchedAt;
	},

	async load(force = false): Promise<AppSessionData | null> {
		const fresh = data !== null && Date.now() - lastFetchedAt < TTL_MS;
		if (fresh && !force) return data;
		if (inflight) return inflight;
		status = data ? 'revalidating' : 'loading';
		inflight = run();
		return inflight;
	},

	update(next: AppSessionData): void {
		data = next;
		lastFetchedAt = Date.now();
		status = 'ready';
		error = null;
	},

	remove(): void {
		data = null;
		lastFetchedAt = 0;
		status = 'unauthorized';
	},

	invalidate(): void {
		lastFetchedAt = 0;
	}
};
