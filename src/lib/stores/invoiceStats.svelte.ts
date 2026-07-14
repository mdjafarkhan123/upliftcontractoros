import type { InvoiceStats } from '$lib/types/invoices';

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

const TTL_MS = 30_000;

let data = $state<InvoiceStats | null>(null);
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let fetchedAt = 0;
let activeController: AbortController | null = null;

// Org-wide invoice AR summary. Not filter-keyed (stats are an org overview,
// independent of the active list tab) — a single slot with stale-while-revalidate.
export const invoiceStatsStore = {
	get data(): InvoiceStats | null {
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
			const res = await fetch('/api/invoices/stats', { signal: controller.signal });
			if (!res.ok) throw new Error('Failed to load invoice stats');
			const body = (await res.json()) as { data: InvoiceStats };
			data = body.data;
			fetchedAt = Date.now();
			status = 'ready';
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			error = e instanceof Error ? e.message : 'Failed to load invoice stats';
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
