import type { DashboardSummary } from '$lib/types/dashboard';

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

const STALE_MS = 8_000;

let data = $state<DashboardSummary | null>(null);
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let inflight: Promise<DashboardSummary | null> | null = null;
let activeController: AbortController | null = null;

function generatedAtMs(): number {
	if (!data) return 0;
	const t = Date.parse(data.generated_at);
	return isNaN(t) ? 0 : t;
}

async function run(): Promise<DashboardSummary | null> {
	if (activeController) activeController.abort();
	const controller = new AbortController();
	activeController = controller;

	try {
		const res = await fetch('/api/dashboard/summary', { signal: controller.signal });
		if (!res.ok) {
			error = 'Failed to load dashboard';
			status = data ? 'ready' : 'error';
			return data;
		}
		data = (await res.json()) as DashboardSummary;
		status = 'ready';
		error = null;
		return data;
	} catch (e) {
		if ((e as { name?: string })?.name === 'AbortError') return data;
		error = e instanceof Error ? e.message : 'Failed to load dashboard';
		status = data ? 'ready' : 'error';
		return data;
	} finally {
		if (activeController === controller) activeController = null;
		inflight = null;
	}
}

export const dashboardStore = {
	get data() {
		return data;
	},
	get status() {
		return status;
	},
	get error() {
		return error;
	},
	get isStale() {
		return Date.now() - generatedAtMs() > STALE_MS;
	},

	async load(force = false): Promise<DashboardSummary | null> {
		const fresh = data !== null && !this.isStale;
		if (fresh && !force) {
			status = 'ready';
			return data;
		}
		if (inflight) return inflight;
		status = data ? 'revalidating' : 'loading';
		error = null;
		inflight = run();
		return inflight;
	},

	invalidate(): void {
		data = null;
		status = 'idle';
		error = null;
		if (activeController) {
			activeController.abort();
			activeController = null;
		}
	}
};
