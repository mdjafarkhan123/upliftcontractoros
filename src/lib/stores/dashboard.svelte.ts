import type { DashboardSummary, DashboardPeriod } from '$lib/types/dashboard';

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

const STALE_MS = 8_000;

// One cache slot per period (month / year), each with stale-while-revalidate.
const cache = $state<Record<DashboardPeriod, DashboardSummary | null>>({
	month: null,
	year: null
});
let period = $state<DashboardPeriod>('month');
let status = $state<Status>('idle');
let error = $state<string | null>(null);

const inflight: Partial<Record<DashboardPeriod, Promise<DashboardSummary | null>>> = {};
const controllers: Partial<Record<DashboardPeriod, AbortController>> = {};

function generatedAtMs(p: DashboardPeriod): number {
	const d = cache[p];
	if (!d) return 0;
	const t = Date.parse(d.generated_at);
	return isNaN(t) ? 0 : t;
}

function isStale(p: DashboardPeriod): boolean {
	return Date.now() - generatedAtMs(p) > STALE_MS;
}

async function run(p: DashboardPeriod): Promise<DashboardSummary | null> {
	controllers[p]?.abort();
	const controller = new AbortController();
	controllers[p] = controller;

	try {
		const res = await fetch(`/api/dashboard/summary?period=${p}`, { signal: controller.signal });
		if (!res.ok) {
			if (p === period) {
				error = 'Failed to load dashboard';
				status = cache[p] ? 'ready' : 'error';
			}
			return cache[p];
		}
		const body = (await res.json()) as DashboardSummary;
		cache[p] = body;
		if (p === period) {
			status = 'ready';
			error = null;
		}
		return body;
	} catch (e) {
		if ((e as { name?: string })?.name === 'AbortError') return cache[p];
		if (p === period) {
			error = e instanceof Error ? e.message : 'Failed to load dashboard';
			status = cache[p] ? 'ready' : 'error';
		}
		return cache[p];
	} finally {
		if (controllers[p] === controller) controllers[p] = undefined;
		inflight[p] = undefined;
	}
}

function loadPeriod(p: DashboardPeriod, force: boolean): Promise<DashboardSummary | null> {
	const fresh = cache[p] !== null && !isStale(p);
	if (fresh && !force) {
		if (p === period) status = 'ready';
		return Promise.resolve(cache[p]);
	}
	if (inflight[p]) return inflight[p]!;
	if (p === period) {
		status = cache[p] ? 'revalidating' : 'loading';
		error = null;
	}
	const promise = run(p);
	inflight[p] = promise;
	return promise;
}

export const dashboardStore = {
	get data() {
		return cache[period];
	},
	get status() {
		return status;
	},
	get error() {
		return error;
	},
	get period() {
		return period;
	},
	get isStale() {
		return isStale(period);
	},

	async load(force = false): Promise<DashboardSummary | null> {
		return loadPeriod(period, force);
	},

	setPeriod(next: DashboardPeriod): void {
		if (next === period) return;
		period = next;
		// Reflect the target period's cache state immediately, then revalidate.
		status = cache[next] ? 'ready' : 'loading';
		error = null;
		void loadPeriod(next, false);
	},

	invalidate(): void {
		cache.month = null;
		cache.year = null;
		status = 'idle';
		error = null;
		for (const p of ['month', 'year'] as const) {
			controllers[p]?.abort();
			controllers[p] = undefined;
		}
	}
};
