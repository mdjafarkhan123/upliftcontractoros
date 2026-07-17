import { SvelteMap } from 'svelte/reactivity';
import type { RequestListItem, RequestsFilters } from '$lib/types/requests';

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

type CacheEntry = {
	items: RequestListItem[];
	fetchedAt: number;
};

const TTL_MS = 30_000;

const cache = new SvelteMap<string, CacheEntry>();
let currentKey = $state('');
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let activeController: AbortController | null = null;

function buildKey(f: RequestsFilters): string {
	return `${f.status}|${f.dateFrom ?? ''}|${f.dateTo ?? ''}|${f.search}`;
}

function buildParams(f: RequestsFilters): URLSearchParams {
	const params = new URLSearchParams();
	if (f.status !== 'all') params.set('status', f.status);
	if (f.dateFrom) params.set('date_from', f.dateFrom);
	if (f.dateTo) params.set('date_to', f.dateTo);
	if (f.search) params.set('q', f.search);
	return params;
}

export const requestsStore = {
	get items(): RequestListItem[] {
		return cache.get(currentKey)?.items ?? [];
	},
	get status() {
		return status;
	},
	get error() {
		return error;
	},

	getById(id: string): RequestListItem | null {
		for (const entry of cache.values()) {
			const found = entry.items.find((i) => i.id === id);
			if (found) return found;
		}
		return null;
	},

	async load(filters: RequestsFilters, force = false): Promise<void> {
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
			const res = await fetch(`/api/requests?${buildParams(filters).toString()}`, {
				signal: controller.signal
			});
			if (!res.ok) throw new Error('Failed to load requests');
			const body = (await res.json()) as { data: { items: RequestListItem[] } };
			cache.set(key, { items: body.data.items, fetchedAt: Date.now() });
			status = 'ready';
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			error = e instanceof Error ? e.message : 'Failed to load requests';
			status = cached ? 'ready' : 'error';
		} finally {
			if (activeController === controller) activeController = null;
		}
	},

	update(patch: Partial<RequestListItem> & { id: string }): void {
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
	},

	invalidate(): void {
		cache.clear();
		currentKey = '';
		status = 'idle';
		error = null;
		if (activeController) {
			activeController.abort();
			activeController = null;
		}
	}
};
