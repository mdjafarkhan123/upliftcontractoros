import { SvelteMap } from 'svelte/reactivity';
import type { QuoteDetail, QuoteListItem, QuotesFilters } from '$lib/types/quotes';

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

type CacheEntry = {
	items: QuoteListItem[];
	nextCursor: string | null;
	fetchedAt: number;
};

type DetailEntry = {
	quote: QuoteDetail;
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

function buildKey(f: QuotesFilters): string {
	return `${f.group}|${f.status}|${f.search}|${f.issuedBy ?? ''}|${f.dateFrom ?? ''}|${f.dateTo ?? ''}`;
}

function statusParam(f: QuotesFilters): string {
	if (f.status !== 'all') return f.status;
	if (f.group === 'active' || f.group === 'closed') return f.group;
	return 'all';
}

function buildParams(f: QuotesFilters, cursor: string | null): URLSearchParams {
	const params = new URLSearchParams();
	if (f.status === 'deleted') {
		// Recycle-bin view — show soft-deleted quotes; status tabs don't apply.
		params.set('deleted', '1');
	} else {
		const s = statusParam(f);
		if (s !== 'all') params.set('status', s);
	}
	if (f.search) params.set('q', f.search);
	if (f.issuedBy) params.set('issued_by', f.issuedBy);
	if (f.dateFrom) params.set('date_from', f.dateFrom);
	if (f.dateTo) params.set('date_to', f.dateTo);
	if (cursor) params.set('cursor', cursor);
	return params;
}

async function fetchPage(
	f: QuotesFilters,
	cursor: string | null,
	signal: AbortSignal
): Promise<{ items: QuoteListItem[]; next_cursor: string | null }> {
	const res = await fetch(`/api/quotes?${buildParams(f, cursor).toString()}`, { signal });
	if (!res.ok) throw new Error('Failed to load quotes');
	return (await res.json()) as { items: QuoteListItem[]; next_cursor: string | null };
}

export const quotesStore = {
	get items(): QuoteListItem[] {
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

	async load(filters: QuotesFilters, force = false): Promise<void> {
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
			error = e instanceof Error ? e.message : 'Failed to load quotes';
			status = cached ? 'ready' : 'error';
		} finally {
			if (activeController === controller) activeController = null;
		}
	},

	async loadMore(filters: QuotesFilters): Promise<void> {
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

	update(patch: Partial<QuoteListItem> & { id: string }): void {
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

	getDetail(id: string): QuoteDetail | null {
		return details.get(id)?.quote ?? null;
	},

	getDetailStatus(id: string): Status {
		return detailState.get(id)?.status ?? 'idle';
	},

	getDetailError(id: string): string | null {
		return detailState.get(id)?.error ?? null;
	},

	setDetail(quote: QuoteDetail): void {
		details.set(quote.id, { quote, fetchedAt: Date.now() });
		detailState.set(quote.id, { status: 'ready', error: null });
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
			const res = await fetch(`/api/quotes/${id}`, { signal: controller.signal });
			if (!res.ok) {
				const message = res.status === 404 ? 'Quote not found' : 'Failed to load';
				detailState.set(id, {
					status: cached ? 'ready' : 'error',
					error: message
				});
				return;
			}
			const body = (await res.json()) as { data: QuoteDetail };
			details.set(id, { quote: body.data, fetchedAt: Date.now() });
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
