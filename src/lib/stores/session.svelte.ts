import { browser } from '$app/environment';
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

const CACHE_KEY = 'cos-session-v2';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

type CachedSession = { v: 2; data: AppSessionData; savedAt: number };

function readCache(): AppSessionData | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as CachedSession;
		if (parsed.v !== 2) return null;
		if (Date.now() - parsed.savedAt > CACHE_MAX_AGE_MS) return null;
		return parsed.data;
	} catch {
		return null;
	}
}

function writeCache(session: AppSessionData): void {
	if (!browser) return;
	try {
		const entry: CachedSession = { v: 2, data: session, savedAt: Date.now() };
		localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
	} catch {
		/* quota or disabled storage — non-fatal */
	}
}

function clearCache(): void {
	if (!browser) return;
	try {
		localStorage.removeItem(CACHE_KEY);
	} catch {
		/* non-fatal */
	}
}

// Seed from localStorage so status is 'ready' the moment JS boots on return
// visits — the loading spinner dismisses at the very first frame.
{
	const cached = readCache();
	if (cached) {
		data = cached;
		status = 'ready';
		lastFetchedAt = Date.now();
	}
}

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
		writeCache(data);
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
		writeCache(next);
	},

	remove(): void {
		data = null;
		lastFetchedAt = 0;
		status = 'unauthorized';
		clearCache();
	},

	invalidate(): void {
		lastFetchedAt = 0;
	}
};
