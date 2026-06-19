import { SvelteMap } from 'svelte/reactivity';
import type { InvoiceDetail, InvoiceListItem, InvoicesFilters } from '$lib/types/invoices';

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

type CacheEntry = {
	items: InvoiceListItem[];
	nextCursor: string | null;
	fetchedAt: number;
};

type DetailEntry = {
	invoice: InvoiceDetail;
	fetchedAt: number;
};

type DetailState = {
	status: Status;
	error: string | null;
};

const TTL_MS = 30_000;

const cache = new SvelteMap<string, CacheEntry>();
const details = new SvelteMap<string, DetailEntry>();
const detailState = new SvelteMap<string, DetailState>();
const detailControllers = new Map<string, AbortController>();
let currentKey = $state('');
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let activeController: AbortController | null = null;

function buildKey(f: InvoicesFilters): string {
	return `${f.group}|${f.status}|${f.search}`;
}

function statusParam(f: InvoicesFilters): string {
	if (f.status !== 'all') return f.status;
	if (f.group === 'open' || f.group === 'closed') return f.group;
	return 'all';
}

function buildParams(f: InvoicesFilters, cursor: string | null): URLSearchParams {
	const params = new URLSearchParams();
	const s = statusParam(f);
	if (s !== 'all') params.set('status', s);
	if (f.search) params.set('q', f.search);
	if (cursor) params.set('cursor', cursor);
	return params;
}

async function fetchPage(
	f: InvoicesFilters,
	cursor: string | null,
	signal: AbortSignal
): Promise<{ items: InvoiceListItem[]; next_cursor: string | null }> {
	const res = await fetch(`/api/invoices?${buildParams(f, cursor).toString()}`, { signal });
	if (!res.ok) throw new Error('Failed to load invoices');
	return (await res.json()) as { items: InvoiceListItem[]; next_cursor: string | null };
}

export const invoicesStore = {
	get items(): InvoiceListItem[] {
		return cache.get(currentKey)?.items ?? [];
	},
	get nextCursor(): string | null {
		return cache.get(currentKey)?.nextCursor ?? null;
	},
	get status() {
		return status;
	},
	get error() {
		return error;
	},
	get lastFetchedAt() {
		return cache.get(currentKey)?.fetchedAt ?? 0;
	},

	async load(filters: InvoicesFilters, force = false): Promise<void> {
		const key = buildKey(filters);
		currentKey = key;

		const cached = cache.get(key);
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

		try {
			const body = await fetchPage(filters, null, controller.signal);
			cache.set(key, {
				items: body.items,
				nextCursor: body.next_cursor,
				fetchedAt: Date.now()
			});
			status = 'ready';
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			error = e instanceof Error ? e.message : 'Failed to load invoices';
			status = cached ? 'ready' : 'error';
		} finally {
			if (activeController === controller) activeController = null;
		}
	},

	async loadMore(filters: InvoicesFilters): Promise<void> {
		const key = buildKey(filters);
		const cached = cache.get(key);
		if (!cached?.nextCursor) return;
		const cursor = cached.nextCursor;
		const controller = new AbortController();
		try {
			const body = await fetchPage(filters, cursor, controller.signal);
			cache.set(key, {
				items: [...cached.items, ...body.items],
				nextCursor: body.next_cursor,
				fetchedAt: Date.now()
			});
		} catch {
			// swallow — user can retry
		}
	},

	update(patch: Partial<InvoiceListItem> & { id: string }): void {
		for (const [k, entry] of cache) {
			const idx = entry.items.findIndex((i) => i.id === patch.id);
			if (idx >= 0) {
				const next = entry.items.slice();
				next[idx] = { ...next[idx], ...patch };
				cache.set(k, { ...entry, items: next });
			}
		}
	},

	remove(id: string): void {
		for (const [k, entry] of cache) {
			if (entry.items.some((i) => i.id === id)) {
				cache.set(k, { ...entry, items: entry.items.filter((i) => i.id !== id) });
			}
		}
		details.delete(id);
		detailState.delete(id);
		const ctrl = detailControllers.get(id);
		if (ctrl) {
			ctrl.abort();
			detailControllers.delete(id);
		}
	},

	getDetail(id: string): InvoiceDetail | null {
		return details.get(id)?.invoice ?? null;
	},

	getDetailStatus(id: string): Status {
		return detailState.get(id)?.status ?? 'idle';
	},

	getDetailError(id: string): string | null {
		return detailState.get(id)?.error ?? null;
	},

	setDetail(invoice: InvoiceDetail): void {
		details.set(invoice.id, { invoice, fetchedAt: Date.now() });
		detailState.set(invoice.id, { status: 'ready', error: null });
	},

	/**
	 * Warm the detail cache on hover / touch-start. Unlike loadDetail it never
	 * aborts/restarts an in-flight request, so rapid hovers don't churn.
	 */
	prefetchDetail(id: string): void {
		const cached = details.get(id);
		const fresh = cached && Date.now() - cached.fetchedAt < TTL_MS;
		if (fresh || detailControllers.has(id)) return;
		void this.loadDetail(id);
	},

	async loadDetail(id: string, force = false): Promise<void> {
		const cached = details.get(id);
		const fresh = cached && Date.now() - cached.fetchedAt < TTL_MS;
		if (fresh && !force) {
			detailState.set(id, { status: 'ready', error: null });
			return;
		}

		const existing = detailControllers.get(id);
		if (existing) existing.abort();
		const controller = new AbortController();
		detailControllers.set(id, controller);

		detailState.set(id, {
			status: cached ? 'revalidating' : 'loading',
			error: null
		});

		try {
			const res = await fetch(`/api/invoices/${id}`, { signal: controller.signal });
			if (!res.ok) {
				const message = res.status === 404 ? 'Invoice not found' : 'Failed to load';
				detailState.set(id, {
					status: cached ? 'ready' : 'error',
					error: message
				});
				return;
			}
			const body = (await res.json()) as { data: InvoiceDetail };
			details.set(id, { invoice: body.data, fetchedAt: Date.now() });
			detailState.set(id, { status: 'ready', error: null });
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			detailState.set(id, {
				status: cached ? 'ready' : 'error',
				error: e instanceof Error ? e.message : 'Failed to load'
			});
		} finally {
			if (detailControllers.get(id) === controller) detailControllers.delete(id);
		}
	},

	invalidate(): void {
		cache.clear();
		details.clear();
		detailState.clear();
		for (const ctrl of detailControllers.values()) ctrl.abort();
		detailControllers.clear();
		currentKey = '';
		status = 'idle';
		error = null;
		if (activeController) {
			activeController.abort();
			activeController = null;
		}
	}
};
