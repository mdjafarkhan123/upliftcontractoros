import type { RequestStats } from '$lib/types/requests';

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

const TTL_MS = 30_000;

let data = $state<RequestStats | null>(null);
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let fetchedAt = 0;
let activeController: AbortController | null = null;

// Org-wide request funnel summary for the KPI strip. Not filter-keyed (an org
// overview, independent of the active tab) — single slot, stale-while-revalidate.
export const requestStatsStore = {
	get data(): RequestStats | null {
		return data;
	},
	get status() {
		return status;
	},
	get error() {
		return error;
	},

	async load(force = false): Promise<void> {
		const fresh = data && Date.now() - fetchedAt < TTL_MS;
		if (fresh && !force) {
			status = 'ready';
			error = null;
			return;
		}

		if (activeController) activeController.abort();
		const controller = new AbortController();
		activeController = controller;

		status = data ? 'revalidating' : 'loading';
		error = null;

		try {
			const res = await fetch('/api/requests/stats', { signal: controller.signal });
			if (!res.ok) throw new Error('Failed to load request stats');
			const body = (await res.json()) as { data: RequestStats };
			data = body.data;
			fetchedAt = Date.now();
			status = 'ready';
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			error = e instanceof Error ? e.message : 'Failed to load request stats';
			status = data ? 'ready' : 'error';
		} finally {
			if (activeController === controller) activeController = null;
		}
	},

	invalidate(): void {
		data = null;
		fetchedAt = 0;
		status = 'idle';
		error = null;
		if (activeController) {
			activeController.abort();
			activeController = null;
		}
	}
};
